import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { MissingTokenError, type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loadedWith = (repo: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", providers: { secrets: "github" }, repo, ...extra } as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

const NOTIFY = {
	providerName: "discord",
	layout: { categories: [{ name: "Ops", channels: [{ name: "sync", webhook: true }] }] },
};

function loaderWith(
	loaded: LoadedConfig,
	secrets: Record<string, unknown> | null,
	notifications: unknown[] = []
): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg === "@theholocron/holocron-plugin-github" && secrets) {
			return {
				createPlugin: () => ({
					name: "gh",
					capabilities: { secrets: () => ({ providerName: "github", ...secrets }) },
				}),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		if (pkg === "@theholocron/holocron-plugin-discord") {
			return {
				createPlugin: () => ({ name: "dc", capabilities: { notifications: () => notifications[0] } }),
			} as unknown as Awaited<ReturnType<PluginImporter>>;
		}
		throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

async function run(
	loaded: LoadedConfig,
	secrets: Record<string, unknown> | null,
	opts: { org?: string; repo?: string; notifications?: unknown[] } = {}
) {
	const lines: string[] = [];
	const report = await runDoctorSecrets({
		loaded,
		context: {
			repoRoot: "/tmp/test",
			...(opts.org ? { org: opts.org } : {}),
			...(opts.repo ? { repo: opts.repo } : {}),
		},
		loader: loaderWith(loaded, secrets, opts.notifications),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

describe("doctor secrets — what is expected", () => {
	it("says none declared when the config expects no secret", async () => {
		const { report, lines } = await run(loadedWith(undefined, { providers: {} }), null);
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([["secrets", "ok", "none declared"]]);
		expect(report.status).toBe("ok");
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("leaves out a declared-empty environment", async () => {
		const { report } = await run(loadedWith({ secrets: { environments: { qa: [] } } }), {
			listSecrets: async () => [],
		});
		expect(report.rows.map((r) => r.id)).toEqual(["secrets"]);
	});
});

describe("doctor secrets — repository and environments", () => {
	const repo = { secrets: { repo: ["TURBO_TOKEN", "NPM_TOKEN"], environments: { production: ["DB_URL"] } } };

	it("passes when every expected secret exists, whatever its case, and ignores extra ones", async () => {
		const listSecrets = vi.fn(async (scope: { kind: string }) =>
			scope.kind === "repo" ? ["turbo_token", "NPM_TOKEN", "EXTRA"] : ["DB_URL"]
		);
		const { report, lines } = await run(loadedWith(repo), { listSecrets });
		expect(report.status).toBe("ok");
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["repo-secrets", "ok", "2 of 2 exist"],
			["env-secrets-production", "ok", "1 of 1 exist"],
		]);
		expect(lines[0]).toContain("repository secrets exist");
		expect(listSecrets).toHaveBeenCalledWith({ kind: "environment", name: "production" });
	});

	it("fails on a missing secret and says which", async () => {
		const { report } = await run(loadedWith(repo), { listSecrets: async () => ["NPM_TOKEN"] });
		expect(report.status).toBe("fail");
		expect(report.rows[0]!.problems).toEqual(["missing secret TURBO_TOKEN"]);
		expect(report.rows[1]).toMatchObject({ status: "fail", problems: ["missing secret DB_URL"] });
	});

	it("fails a scope whose read throws, with the message, and keeps checking the rest", async () => {
		const listSecrets = vi.fn(async (scope: { kind: string }) => {
			if (scope.kind === "environment") throw new Error("404 Not Found");
			return ["TURBO_TOKEN", "NPM_TOKEN"];
		});
		const { report } = await run(loadedWith(repo), { listSecrets });
		expect(report.rows.map((r) => [r.status, r.detail])).toEqual([
			["ok", "2 of 2 exist"],
			["fail", "404 Not Found"],
		]);
	});

	it("skips a scope the provider has no token for", async () => {
		const { report } = await run(loadedWith(repo), {
			listSecrets: async () => {
				throw new MissingTokenError("needs the org token");
			},
		});
		expect(report.status).toBe("skip");
		expect(report.rows[0]).toMatchObject({ status: "skip", detail: "needs the org token" });
		expect(report.reason).toBe("needs the org token; needs the org token");
	});
});

describe("doctor secrets — organization", () => {
	it("expects the notification layout's secrets and the declared ones in the org", async () => {
		const listSecrets = vi.fn(async () => ["HOLOCRON_NOTIFY_WEBHOOK_SYNC", "NPM_TOKEN"]);
		const { report } = await run(
			loadedWith(
				{ secrets: { org: ["NPM_TOKEN"] } },
				{ providers: { secrets: "github", notifications: ["discord"] } }
			),
			{ listSecrets },
			{ org: "acme", notifications: [NOTIFY] }
		);
		expect(report.rows[0]).toMatchObject({ id: "org-secrets", status: "ok", detail: "2 of 2 exist" });
		expect(listSecrets).toHaveBeenCalledWith({ kind: "organization", name: "acme" });
	});

	it("ignores a notifications provider with no layout", async () => {
		const { report } = await run(
			loadedWith(undefined, { providers: { secrets: "github", notifications: ["discord"] } }),
			{ listSecrets: async () => [] },
			{ notifications: [{ providerName: "discord" }] }
		);
		expect(report.rows[0]!.detail).toBe("none declared");
	});

	it("takes the organization from the repo name when none is given", async () => {
		const listSecrets = vi.fn(async () => ["A"]);
		await run(loadedWith({ name: "acme/demo", secrets: { org: ["A"] } }), { listSecrets });
		expect(listSecrets).toHaveBeenCalledWith({ kind: "organization", name: "acme" });
	});

	it("takes the organization from the context repo before the config's", async () => {
		const listSecrets = vi.fn(async () => ["A"]);
		await run(loadedWith({ name: "x/y", secrets: { org: ["A"] } }), { listSecrets }, { repo: "corp/app" });
		expect(listSecrets).toHaveBeenCalledWith({ kind: "organization", name: "corp" });
	});

	it("fails when there is no organization to look under", async () => {
		const { report } = await run(loadedWith({ secrets: { org: ["A"] } }), { listSecrets: async () => [] });
		expect(report.rows[0]).toMatchObject({ status: "fail", detail: "1 problem(s)" });
		expect(report.rows[0]!.problems[0]).toMatch(/no organization/);
	});
});

describe("doctor secrets — no provider", () => {
	it("skips every scope with the reason, and the run is a skip", async () => {
		const { report, lines } = await run(
			loadedWith({ secrets: { repo: ["A"], org: ["B"] } }, { providers: {} }),
			null,
			{ org: "acme" }
		);
		expect(report.rows.map((r) => r.status)).toEqual(["skip", "skip"]);
		expect(report.status).toBe("skip");
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 2 skipped");
	});
});

describe("doctor secrets — defaults", () => {
	it("prints to the console and builds its own loader when none is passed", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorSecrets({
			loaded: loadedWith(undefined, { providers: {} }),
			context: { repoRoot: "/tmp/test" },
		});
		log.mockRestore();
		expect(report.status).toBe("ok");
	});
});
