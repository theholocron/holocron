import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { accessRow, shadowRow } from "./access-rows.js";
import { runDoctorSecrets } from "./doctor-secrets.js";

type Raw = Parameters<typeof resolveConfig>[0];

async function run(opts: {
	sync: Array<Record<string, unknown>>;
	repoSecrets?: string[];
	held?: string[];
	vault?: Record<string, unknown> | null;
	secrets?: boolean;
	org?: string;
	/** What the repository scope holds, when it differs from `held` (the default for every scope). */
	repoHeld?: string[];
	/** What `listSecretAccess` gives, an Error it throws, or `false` for a provider that cannot report access. */
	access?: Record<string, { visibility: string; repos?: string[] }> | Error | false;
}) {
	const resolved = resolveConfig({
		name: "demo",
		providers: { secrets: "github", ...(opts.vault === null ? {} : { vault: "doppler" }) },
		repo: { secrets: { ...(opts.repoSecrets ? { repo: opts.repoSecrets } : {}), sync: opts.sync } },
	} as unknown as Raw);
	const listSecrets = vi.fn(async (scope: { kind: string }) =>
		scope.kind === "repo" && opts.repoHeld ? opts.repoHeld : (opts.held ?? [])
	);
	const listSecretAccess = vi.fn(async () => {
		if (opts.access instanceof Error) throw opts.access;
		return opts.access || {};
	});
	const importer = vi.fn(async (pkg: string) => {
		if (pkg === "@theholocron/holocron-plugin-github" && opts.secrets !== false) {
			return {
				createPlugin: () => ({
					name: "gh",
					capabilities: {
						secrets: () => ({
							providerName: "github",
							listSecrets,
							...(opts.access === false || opts.access === undefined ? {} : { listSecretAccess }),
						}),
					},
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		if (pkg === "@theholocron/holocron-plugin-doppler" && opts.vault) {
			return {
				createPlugin: () => ({
					name: "dp",
					capabilities: { vault: () => ({ providerName: "doppler", ...opts.vault }) },
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	});
	const lines: string[] = [];
	const report = await runDoctorSecrets({
		loaded: { resolved, filepath: "/tmp/test/holocron.config.json" },
		context: { repoRoot: "/tmp/test", org: opts.org ?? "acme" },
		loader: new PluginLoader(resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines, listSecrets, listSecretAccess };
}

const readEnvironment = async () => ({ API_KEY: "v1", DB_URL: "v2" });

describe("doctor secrets — repo.secrets.sync", () => {
	it("expects the keys the vault holds at the repository, joined with the declared ones", async () => {
		const { report, listSecrets } = await run({
			sync: [{ environment: "prd" }],
			repoSecrets: ["api_key", "OTHER"],
			vault: { readEnvironment },
			held: ["API_KEY", "OTHER"],
		});
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([["repo-secrets", "fail"]]);
		expect(report.rows[0]!.problems.join(" ")).toMatch(/DB_URL/);
		expect(listSecrets).toHaveBeenCalledTimes(1);
	});

	it("checks an environment scope, our organization and another organization separately", async () => {
		const { report } = await run({
			sync: [
				{ environment: "prd", keys: ["E"], scope: "env=production" },
				{ environment: "prd", keys: ["O"], scope: "org=acme", repos: ["a"] },
				{ environment: "prd", keys: ["F"], scope: "org=other", repos: ["a"] },
				{ environment: "prd", keys: ["G"], scope: "org=other", repos: ["a"] },
				{ environment: "empty", keys: [], scope: "org=third", repos: ["a"] },
			],
			vault: null,
			held: ["E", "O", "F", "G"],
			repoHeld: [],
		});
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([
			["org-secrets", "ok"],
			["env-secrets-production", "ok"],
			["org-secrets-other", "ok"],
			["org-secret-access", "skip"],
			["org-secret-access-other", "skip"],
			["org-secret-access-third", "skip"],
			["org-secret-shadowed", "ok"],
		]);
		expect(report.rows[2]!.detail).toBe("2 of 2 exist");
	});

	it("skips an entry with the reason when there is no vault, but still checks the rest", async () => {
		const { report } = await run({
			sync: [{ environment: "prd" }, { environment: "dev", keys: ["K"] }],
			vault: null,
			held: ["K"],
		});
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([
			["repo-secrets", "ok"],
			["sync-prd", "skip"],
		]);
		expect(report.status).toBe("ok");
	});

	it("reports only the skipped entry when nothing else is expected", async () => {
		const { report } = await run({ sync: [{ environment: "prd" }], vault: null });
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([["sync-prd", "skip"]]);
		expect(report.status).toBe("skip");
	});
});

describe("doctor secrets — who can read an organization secret", () => {
	const entry = { environment: "prd", keys: ["A", "B"], scope: "org=acme", repos: ["acme/holocron", ".github"] };
	const base = { sync: [entry], vault: null, held: ["A", "B"], repoHeld: [] as string[] };

	it("reports how many secrets sit at each reader list, and is ok when they match their entry", async () => {
		const { report } = await run({
			...base,
			access: {
				A: { visibility: "selected", repos: ["holocron", ".github"] },
				b: { visibility: "selected", repos: [".github", "holocron"] },
			},
		});
		const row = report.rows.find((r) => r.id === "org-secret-access")!;
		expect(row.status).toBe("ok");
		expect(row.detail).toBe("2 selected [.github, holocron]");
		expect(report.status).toBe("ok");
	});

	it("fails by name for a secret readable by every repository or by an extra one, or missing a declared one", async () => {
		const { report } = await run({
			...base,
			access: { A: { visibility: "all" }, B: { visibility: "selected", repos: ["holocron", "node-template"] } },
		});
		const row = report.rows.find((r) => r.id === "org-secret-access")!;
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual([
			"A is readable by every repository (visibility all); its entry says selected [.github, holocron]",
			"B is also readable by node-template; its entry says selected [.github, holocron]",
			"B is not readable by .github; its entry says selected [.github, holocron]",
		]);
		expect(report.status).toBe("fail");
	});

	it("treats a selected secret that GitHub lists with no repositories as readable by none", async () => {
		const { report } = await run({ ...base, access: { A: { visibility: "selected" } } });
		expect(report.rows.find((r) => r.id === "org-secret-access")!.problems).toEqual([
			"A is not readable by .github, holocron; its entry says selected [.github, holocron]",
		]);
	});

	it("names a private secret as readable by every private repository", async () => {
		const { report } = await run({ ...base, access: { A: { visibility: "private" } } });
		expect(report.rows.find((r) => r.id === "org-secret-access")!.problems[0]).toMatch(
			/A is readable by every private repository \(visibility private\)/
		);
	});

	it("leaves a secret that does not exist to the exist row, and skips when none of them do", async () => {
		const { report } = await run({ ...base, access: {} });
		const row = report.rows.find((r) => r.id === "org-secret-access")!;
		expect([row.status, row.detail]).toEqual(["skip", "none of the synced secrets exist yet"]);
	});

	it("skips with the reason when the provider cannot report access", async () => {
		const { report } = await run({ ...base, access: false });
		const row = report.rows.find((r) => r.id === "org-secret-access")!;
		expect([row.status, row.detail]).toEqual([
			"skip",
			"secrets provider (github) cannot report who can read a secret",
		]);
	});

	it("fails with the message when the access cannot be read", async () => {
		const { report } = await run({ ...base, access: new Error("boom") });
		const row = report.rows.find((r) => r.id === "org-secret-access")!;
		expect([row.status, row.detail]).toEqual(["fail", "boom"]);
	});

	it("checks another organization under its own row, and an environment scope not at all", async () => {
		const { report, listSecretAccess } = await run({
			sync: [
				{ environment: "prd", keys: ["F"], scope: "org=other", repos: ["x"] },
				{ environment: "prd", keys: ["Z"], scope: "env=staging" },
			],
			vault: null,
			held: ["F", "Z"],
			repoHeld: [],
			access: { F: { visibility: "selected", repos: ["x"] } },
		});
		expect(report.rows.map((r) => r.id)).toContain("org-secret-access-other");
		expect(report.rows.map((r) => r.id)).not.toContain("org-secret-access");
		expect(listSecretAccess).toHaveBeenCalledTimes(1);
	});

	it("fails a name that exists at both repository and organization level", async () => {
		const { report } = await run({
			...base,
			repoHeld: ["a"],
			access: { A: { visibility: "selected", repos: ["holocron", ".github"] } },
		});
		const row = report.rows.find((r) => r.id === "org-secret-shadowed")!;
		expect(row.status).toBe("fail");
		expect(row.problems).toEqual([
			"A exists at repository and organization level: the repository secret overrides it",
		]);
	});

	it("skips the shadow row when there is no token, and fails it on another error", async () => {
		const noToken = new MissingTokenError("no token");
		const skipped = await run({ ...base, access: false, held: ["A", "B"], repoHeld: [] });
		expect(skipped.report.rows.find((r) => r.id === "org-secret-shadowed")!.status).toBe("ok");
		const secrets = {
			providerName: "github",
			listSecrets: async () => {
				throw noToken;
			},
		} as never;
		expect((await shadowRow(secrets, ["A"])).status).toBe("skip");
		const broken = {
			providerName: "github",
			listSecrets: async () => {
				throw new Error("down");
			},
		} as never;
		const failed = await shadowRow(broken, ["A"]);
		expect([failed.status, failed.detail]).toEqual(["fail", "down"]);
		const noAccess = {
			providerName: "github",
			listSecretAccess: async () => {
				throw noToken;
			},
		} as never;
		expect((await accessRow(noAccess, { org: "o", declared: new Map() }, true)).status).toBe("skip");
	});
});
