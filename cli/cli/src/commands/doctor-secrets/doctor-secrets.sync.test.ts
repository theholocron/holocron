import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runDoctorSecrets } from "./doctor-secrets.js";

type Raw = Parameters<typeof resolveConfig>[0];

async function run(opts: {
	sync: Array<Record<string, unknown>>;
	repoSecrets?: string[];
	held?: string[];
	vault?: Record<string, unknown> | null;
	secrets?: boolean;
	org?: string;
}) {
	const resolved = resolveConfig({
		name: "demo",
		providers: { secrets: "github", ...(opts.vault === null ? {} : { vault: "doppler" }) },
		repo: { secrets: { ...(opts.repoSecrets ? { repo: opts.repoSecrets } : {}), sync: opts.sync } },
	} as unknown as Raw);
	const listSecrets = vi.fn(async () => opts.held ?? []);
	const importer = vi.fn(async (pkg: string) => {
		if (pkg === "@theholocron/holocron-plugin-github" && opts.secrets !== false) {
			return {
				createPlugin: () => ({
					name: "gh",
					capabilities: { secrets: () => ({ providerName: "github", listSecrets }) },
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
	return { report, lines, listSecrets };
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
				{ environment: "prd", keys: ["O"], scope: "org=acme" },
				{ environment: "prd", keys: ["F"], scope: "org=other" },
				{ environment: "prd", keys: ["G"], scope: "org=other" },
				{ environment: "empty", keys: [], scope: "org=third" },
			],
			vault: null,
			held: ["E", "O", "F", "G"],
		});
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([
			["org-secrets", "ok"],
			["env-secrets-production", "ok"],
			["org-secrets-other", "ok"],
		]);
		expect(report.rows.at(-1)!.detail).toBe("2 of 2 exist");
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
