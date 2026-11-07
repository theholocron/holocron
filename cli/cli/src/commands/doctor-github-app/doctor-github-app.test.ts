import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import type { GitHubApp, GitHubAppInstallation } from "@theholocron/github-client";
import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import type { PluginLoader } from "../../plugin/index.js";
import { runDoctorGitHubApp } from "./doctor-github-app.js";
import type { GitHubAppApi, RunDoctorGitHubAppInput } from "./doctor-github-app.type.js";
import { parseManifest } from "./parse-manifest.js";
import { permissionGaps } from "./permission-gaps.js";
import { appSettingsUrl, installationSettingsUrl } from "./settings-urls.js";

// Put together from parts so the source holds no PEM block for a secret scanner to take for a real key.
const KEY = ["-----BEGIN", "RSA PRIVATE KEY-----\nSECRETKEYBODY\n-----END", "RSA PRIVATE KEY-----\n"].join(" ");
const MANIFEST = JSON.stringify({
	default_permissions: { checks: "write", metadata: "read" },
	default_events: ["push", "pull_request_review"],
});
const INSTANCES = [{ name: "Sentinel", manifest: "m.json", environment: "Sentinel" }];

const app = (over: Partial<GitHubApp> = {}): GitHubApp => ({
	slug: "sentinel",
	name: "Sentinel",
	owner: { login: "theholocron", type: "Organization" },
	permissions: { checks: "write", metadata: "read" },
	events: ["push", "pull_request_review"],
	...over,
});
const installation = (over: Partial<GitHubAppInstallation> = {}): GitHubAppInstallation => ({
	id: 7,
	account: { login: "theholocron", type: "Organization" },
	permissions: { checks: "write", metadata: "read" },
	events: ["push", "pull_request_review"],
	...over,
});

interface Fakes {
	vault?: unknown;
	live?: GitHubApp;
	installations?: GitHubAppInstallation[];
	getApp?: GitHubAppApi["getApp"];
	manifest?: string | Error;
	instances?: unknown;
}

async function run(fakes: Fakes = {}, extra: Partial<RunDoctorGitHubAppInput> = {}) {
	const lines: string[] = [];
	const vault =
		"vault" in fakes
			? fakes.vault
			: {
					providerName: "1password",
					readEnvironment: async () => ({ GITHUB_APP_ID: "42", GITHUB_APP_PRIVATE_KEY: KEY }),
				};
	const loader = {
		load: async () => undefined,
		loadFailures: () => [],
		loadedKeys: () => ["vault"],
		has: (key: string) => key === "vault" && vault !== undefined,
		get: () => vault,
	} as unknown as PluginLoader;
	const report = await runDoctorGitHubApp({
		loaded: {
			resolved: resolveConfig({
				name: "demo",
				org: "acme",
				providers: {},
				githubApps: "instances" in fakes ? fakes.instances : INSTANCES,
			} as never),
			filepath: "/tmp/x",
		},
		context: { repoRoot: "/tmp/test" },
		loader,
		readManifest: () => {
			if (fakes.manifest instanceof Error) throw fakes.manifest;
			return fakes.manifest ?? MANIFEST;
		},
		api: {
			getApp: fakes.getApp ?? (async () => fakes.live ?? app()),
			listAppInstallations: async () => fakes.installations ?? [installation()],
		},
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
		...extra,
	});
	return { report, text: lines.join("\n") };
}

describe("runDoctorGitHubApp", () => {
	it("passes when the App matches its manifest, and names extras as info", async () => {
		const { report, text } = await run({
			installations: [
				installation({
					events: ["push", "pull_request_review", "star"],
					permissions: { checks: "admin", metadata: "read", issues: "read" },
				}),
			],
			live: app({
				events: ["push", "pull_request_review", "star"],
				permissions: { checks: "admin", metadata: "read", issues: "read" },
			}),
		});
		expect(report.status).toBe("ok");
		expect(report.summary).toEqual({ ok: 4, fail: 0, skip: 0 });
		expect(text).toContain("info: 1 extra event(s) not in the manifest (star)");
		expect(text).toContain("info: 1 extra permission(s) not in the manifest (issues)");
		expect(text).not.toContain("SECRETKEYBODY");
	});

	it("fails on a missing event and ends with the org settings page", async () => {
		const { report } = await run({ live: app({ events: ["push"] }) });
		expect(report.status).toBe("fail");
		const events = report.rows.find((r) => r.id === "Sentinel:events")!;
		expect(events.problems).toEqual([
			"missing event pull_request_review",
			'fix: https://github.com/organizations/theholocron/settings/apps/sentinel/permissions (events are on the same page, under "Subscribe to events")',
		]);
	});

	it("fails on a missing permission and on a lower access level, with the user-owned page", async () => {
		const { report } = await run({
			live: app({ owner: { login: "me", type: "User" }, permissions: { checks: "read" } }),
		});
		const permissions = report.rows.find((r) => r.id === "Sentinel:permissions")!;
		expect(permissions.status).toBe("fail");
		expect(permissions.problems).toEqual([
			"permission checks is read, wants write",
			"missing permission metadata (read)",
			expect.stringContaining("https://github.com/settings/apps/sentinel/permissions"),
		]);
	});

	it("fails an installation that has not accepted the App's update, with its page", async () => {
		const { report } = await run({
			installations: [
				installation({ permissions: { checks: "read", metadata: "read" } }),
				installation({ id: 8, account: { login: "me", type: "User" }, events: ["push"] }),
				installation({ id: 9, account: null, permissions: {} }),
			],
		});
		const row = report.rows.find((r) => r.id === "Sentinel:installations")!;
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual([
			"theholocron has not accepted the current App: permission checks is read, wants write",
			"fix: theholocron accepts the update at https://github.com/organizations/theholocron/settings/installations/7",
			"me has not accepted the current App: missing event pull_request_review",
			"fix: me accepts the update at https://github.com/settings/installations/8",
			expect.stringContaining("installation 9 has not accepted"),
			"fix: installation 9 accepts the update at https://github.com/settings/installations/9",
		]);
	});

	it("skips an instance whose credentials cannot be read, without failing the run", async () => {
		const { report } = await run({
			vault: {
				providerName: "1password",
				readEnvironment: async () => {
					throw new Error("op: not signed in");
				},
			},
		});
		expect(report.status).toBe("skip");
		expect(report.reason).toBe('cannot read the "Sentinel" environment: op: not signed in');
	});

	it("skips when the environment lacks the id or key", async () => {
		const { report } = await run({
			vault: { providerName: "1password", readEnvironment: async () => ({ GITHUB_APP_ID: "42" }) },
		});
		expect(report.reason).toBe('"Sentinel" does not hold GITHUB_APP_PRIVATE_KEY');
	});

	it("skips when there is no vault, or one that cannot read an environment", async () => {
		expect((await run({ vault: undefined })).report.reason).toContain("needs a `vault` provider");
		const { report } = await run({ vault: { providerName: "doppler" } });
		expect(report.reason).toBe("doppler cannot read an environment's variables");
	});

	it("turns a key kept on one line back into lines before signing, and leaves a multi-line one as is", async () => {
		const seen: string[] = [];
		const getApp: GitHubAppApi["getApp"] = async (creds) => {
			seen.push(creds.privateKey);
			return app();
		};
		await run(
			{
				getApp,
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ GITHUB_APP_ID: " 42 ", GITHUB_APP_PRIVATE_KEY: "a\\nb" }),
				},
			},
			{}
		);
		await run({ getApp });
		expect(seen).toEqual(["a\nb", KEY]);
	});

	it("fails when GitHub rejects the JWT, without printing the key", async () => {
		const { report, text } = await run({
			getApp: async () => {
				throw new Error(`GitHub GET /app → 401 (${KEY})`);
			},
		});
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.detail).toBe("cannot call GitHub as the App: GitHub GET /app → 401 ([redacted])");
		expect(text).not.toContain("SECRETKEYBODY");
	});

	it("fails on a manifest that cannot be read or is not valid", async () => {
		const missing = await run({ manifest: new Error("ENOENT: no such file") });
		expect(missing.report.rows[0]).toMatchObject({
			id: "Sentinel:manifest",
			status: "fail",
			detail: "cannot read m.json: ENOENT: no such file",
		});
		const invalid = await run({ manifest: "{ not json" });
		expect(invalid.report.status).toBe("fail");
	});

	it("skips with its reason when nothing is declared", async () => {
		const { report } = await run({ instances: undefined });
		expect(report.status).toBe("skip");
		expect(report.reason).toBe("no `githubApps` are declared in holocron.config.ts");
	});

	it("checks every instance and fails the run when one fails", async () => {
		const { report } = await run({
			instances: [...INSTANCES, { name: "Sentinel - dev", manifest: "m.json", environment: "Sentinel - dev" }],
			live: app({ events: [] }),
		});
		expect(report.rows.filter((r) => r.id.endsWith(":reachable")).map((r) => r.title)).toEqual([
			"Sentinel: reachable",
			"Sentinel - dev: reachable",
		]);
		expect(report.status).toBe("fail");
	});

	it("reads the manifest from the directory and prints to the console by default", async () => {
		const root = mkdtempSync(join(tmpdir(), "doctor-app-"));
		writeFileSync(join(root, "m.json"), MANIFEST);
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		try {
			const { report } = await run(
				{},
				{ readManifest: undefined, context: { repoRoot: root }, print: undefined }
			);
			expect(report.status).toBe("ok");
			expect(log).toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});
});

describe("parseManifest", () => {
	it("reads permissions and events", () => {
		expect(parseManifest(MANIFEST)).toEqual({
			permissions: { checks: "write", metadata: "read" },
			events: ["push", "pull_request_review"],
		});
	});

	it("treats a missing event list as empty", () => {
		expect(parseManifest('{"default_permissions":{}}').events).toEqual([]);
	});

	it.each([
		['{"default_permissions":[]}', /default_permissions. must be an object/],
		["{}", /default_permissions. must be an object/],
		['{"default_permissions":{"checks":"owner"}}', /checks. must be read, write or admin, got "owner"/],
		['{"default_permissions":{},"default_events":"push"}', /default_events. must be a list/],
		['{"default_permissions":{},"default_events":[1]}', /default_events. must be a list/],
	])("rejects %s", (text, message) => {
		expect(() => parseManifest(text)).toThrow(message);
	});
});

describe("permissionGaps", () => {
	it("orders read < write < admin and reports what is missing", () => {
		expect(permissionGaps({ a: "write", b: "read", c: "read" }, { a: "admin", b: "read" })).toEqual([
			"missing permission c (read)",
		]);
		expect(permissionGaps({ a: "admin" }, { a: "write" })).toEqual(["permission a is write, wants admin"]);
		expect(permissionGaps({ a: "read" }, { a: "bogus" })).toEqual(["permission a is bogus, wants read"]);
	});
});

describe("settings urls", () => {
	it("picks the organization or the user page, and falls back to the user page without an owner", () => {
		expect(appSettingsUrl(app())).toBe(
			"https://github.com/organizations/theholocron/settings/apps/sentinel/permissions"
		);
		expect(appSettingsUrl(app({ owner: null }))).toBe("https://github.com/settings/apps/sentinel/permissions");
		expect(installationSettingsUrl({ login: "o", type: "Organization" }, 3)).toBe(
			"https://github.com/organizations/o/settings/installations/3"
		);
		expect(installationSettingsUrl(null, 3)).toBe("https://github.com/settings/installations/3");
	});
});
