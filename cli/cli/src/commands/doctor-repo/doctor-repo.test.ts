import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import {
	type LabelDef,
	MissingTokenError,
	type PluginImporter,
	PluginLoader,
	ProviderApiError,
	type SourceSecurity,
} from "../../plugin/index.js";
import type { CheckRow } from "../doctor-checks/index.js";
import { CANONICAL_LABELS } from "../setup/labels.js";
import { BALANCED_REPO_SETTINGS } from "../setup/repo-settings.js";
import { runDoctorRepo } from "./doctor-repo.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loadedWith = (extra: Record<string, unknown> = {}): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", providers: { source: "github" }, ...extra } as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

function loaderWith(loaded: LoadedConfig, source: Record<string, unknown> | null): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-github" || !source) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({
				name: "gh",
				capabilities: { source: () => ({ providerName: "github", ...source }) },
			}),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

async function run(loaded: LoadedConfig, source: Record<string, unknown> | null) {
	const lines: string[] = [];
	const report = await runDoctorRepo({
		loaded,
		context: { repoRoot: "/tmp/test" },
		loader: loaderWith(loaded, source),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

const info = (over: Record<string, unknown> = {}) => ({
	description: "A demo",
	homepage: "https://demo.dev",
	defaultBranch: "alpha",
	topics: ["a", "b"],
	settings: { ...BALANCED_REPO_SETTINGS, default_branch: "alpha" },
	...over,
});
const ALL_ON: SourceSecurity = {
	vulnerabilityAlerts: true,
	automatedSecurityFixes: true,
	secretScanning: true,
	secretScanningPushProtection: true,
	privateVulnerabilityReporting: true,
	codeScanningDefaultSetup: true,
};
const labels = (): LabelDef[] => CANONICAL_LABELS.map((l) => ({ ...l }));
const byId = (rows: CheckRow[], id: string) => rows.find((r) => r.id === id)!;

describe("doctor repo — what is checked", () => {
	it("checks only labels and security when the config declares nothing else", async () => {
		const { report, lines } = await run(loadedWith(), {
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
		});
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([
			["repo-labels", "ok"],
			["repo-security", "ok"],
		]);
		expect(report.status).toBe("ok");
		expect(lines.at(-1)).toBe("2 ok, 0 fail, 0 skipped");
	});

	it("checks every group the config declares", async () => {
		const { report } = await run(
			loadedWith({
				description: "A demo",
				homepage: "https://demo.dev",
				repo: {
					defaultBranch: "alpha",
					protection: "balanced",
					topics: ["a", "b"],
					teams: ["maintainers"],
					properties: { lifecycle: "active" },
				},
			}),
			{}
		);
		expect(report.rows.map((r) => r.id)).toEqual([
			"repo-description",
			"repo-settings",
			"repo-topics",
			"repo-properties",
			"repo-labels",
			"repo-teams",
			"repo-protection",
			"repo-security",
		]);
	});
});

const { allow_auto_merge: _omitted, ...withoutAutoMerge } = BALANCED_REPO_SETTINGS;

describe("doctor repo — description, settings and topics", () => {
	const declared = {
		description: "A demo",
		homepage: "https://demo.dev",
		repo: { defaultBranch: "alpha", protection: "balanced", topics: ["a", "b"] },
	};

	it("passes when everything matches, and an undeclared extra topic only matters when setup would remove it", async () => {
		const { report } = await run(loadedWith(declared), {
			getRepoInfo: async () => info(),
			listRulesets: async () => [{ id: 1, name: "holocron-default-branch", enforcement: "active" }],
			getRulesetDetail: async () => ({
				name: "holocron-default-branch",
				enforcement: "active",
				ruleTypes: ["deletion", "non_fast_forward", "pull_request"],
				requiredChecks: [],
			}),
			getProperties: async () => ({ holocron_branch_protection_level: "balanced" }),
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
		});
		expect(report.rows.map((r) => r.status)).toEqual(["ok", "ok", "ok", "ok", "ok", "ok", "ok"]);
		expect(byId(report.rows, "repo-description").detail).toBe("2 of 2 match");
	});

	it("names a description that differs, a homepage that is unset, a setting off, a wrong branch and topic drift", async () => {
		const { report } = await run(loadedWith(declared), {
			getRepoInfo: async () =>
				info({
					description: "Old",
					homepage: null,
					defaultBranch: "main",
					topics: ["a", "z"],
					settings: { ...withoutAutoMerge, default_branch: "main", has_wiki: true },
				}),
			getProperties: async () => ({}),
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
			listRulesets: async () => [],
		});
		expect(byId(report.rows, "repo-description").problems).toEqual([
			'repository field description: declared "A demo", found "Old"',
			'repository field homepage: declared "https://demo.dev", found ""',
		]);
		expect(byId(report.rows, "repo-settings").problems).toEqual([
			"missing repository setting allow_auto_merge",
			"repository setting has_wiki: declared false, found true",
			'repository setting default_branch: declared "alpha", found "main"',
		]);
		expect(byId(report.rows, "repo-topics").problems).toEqual(["missing topic b", "unexpected topic z"]);
		expect(report.status).toBe("fail");
	});

	it("checks the default branch alone when there is no protection preset, and only the declared description", async () => {
		const { report } = await run(loadedWith({ description: "A demo", repo: { defaultBranch: "alpha" } }), {
			getRepoInfo: async () => info({ description: null, settings: { default_branch: "alpha" } }),
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
		});
		expect(byId(report.rows, "repo-settings")).toMatchObject({ status: "ok", detail: "1 of 1 match" });
		expect(byId(report.rows, "repo-description").problems).toEqual([
			'repository field description: declared "A demo", found ""',
		]);
	});

	it("takes the protection preset `none` as no settings to apply", async () => {
		const { report } = await run(loadedWith({ repo: { protection: "none" } }), {});
		expect(report.rows.map((r) => r.id)).toEqual(["repo-labels", "repo-security"]);
	});
});

describe("doctor repo — custom properties", () => {
	const declared = {
		repo: {
			protection: "strict",
			properties: {
				lifecycle: "active",
				open_source: true,
				runtime_environment: "node",
				uses_external_packages: false,
			},
		},
	};

	it("compares each declared property as text, joining a multi-select, and ignores the ones it did not declare", async () => {
		const { report } = await run(loadedWith(declared), {
			getProperties: async () => ({
				holocron_branch_protection_level: ["strict"],
				lifecycle: "active",
				open_source: "false",
				runtime_environment: "node",
				monorepo: "true",
			}),
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
		});
		const row = byId(report.rows, "repo-properties");
		expect(row.problems).toEqual([
			'property open_source: declared "true", found "false"',
			"missing property uses_external_packages",
		]);
	});

	it("joins a multi-select value with commas", async () => {
		const { report } = await run(loadedWith({ repo: { properties: { lifecycle: "a,b" as never } } }), {
			getProperties: async () => ({ lifecycle: ["a", "b"] }),
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
		});
		expect(byId(report.rows, "repo-properties").status).toBe("ok");
	});
});

describe("doctor repo — labels and teams", () => {
	it("names a label that is missing, one that drifted, and a stale one setup would delete", async () => {
		const found = labels().filter((l) => l.name !== "bug");
		found[0] = { ...found[0]!, color: "000000" };
		found.push(
			{ name: "javascript", color: "f1e05a", description: "" },
			{ name: "mine", color: "fff", description: "" }
		);
		const { report } = await run(loadedWith(), { listLabels: async () => found, getSecurity: async () => ALL_ON });
		expect(byId(report.rows, "repo-labels").problems).toEqual([
			"missing label bug",
			`label ${found[0]!.name}: declared ${CANONICAL_LABELS[1]!.color} "${CANONICAL_LABELS[1]!.description}", found 000000 "${CANONICAL_LABELS[1]!.description}"`,
			"stale label javascript (repo setup removes it)",
		]);
	});

	it("compares team permissions, with a bare slug meaning push", async () => {
		const { report } = await run(
			loadedWith({ repo: { teams: ["maintainers", { slug: "owners", permission: "admin" }, "ghosts"] } }),
			{
				listTeamAccess: async () => [
					{ slug: "maintainers", permission: "push" },
					{ slug: "owners", permission: "push" },
					{ slug: "extra", permission: "pull" },
				],
				listLabels: async () => labels(),
				getSecurity: async () => ALL_ON,
			}
		);
		expect(byId(report.rows, "repo-teams").problems).toEqual([
			'team owners: declared "admin", found "push"',
			"missing team ghosts",
		]);
	});
});

describe("doctor repo — branch protection", () => {
	const RULESET = { id: 7, name: "holocron-default-branch", enforcement: "active" as const };
	const base = { listLabels: async () => labels(), getSecurity: async () => ALL_ON };
	const strict = loadedWith({
		tasks: ["verification.unitTests"],
		extraRequiredChecks: ["Extra / Check"],
		repo: { protection: "strict" },
	});

	it("says the ruleset is missing", async () => {
		const { report } = await run(loadedWith({ repo: { protection: "balanced" } }), {
			...base,
			getProperties: async () => ({}),
			getRulesetDetail: async () => {
				throw new Error("unreachable");
			},
			listRulesets: async () => [{ ...RULESET, name: "other" }],
		});
		expect(byId(report.rows, "repo-protection").problems).toEqual(["missing ruleset holocron-default-branch"]);
	});

	it("names a ruleset that is not active, lacks a rule or has the wrong required checks (strict)", async () => {
		const { report } = await run(strict, {
			...base,
			getProperties: async () => ({}),
			listRulesets: async () => [RULESET],
			getRulesetDetail: async () => ({
				name: RULESET.name,
				enforcement: "evaluate",
				ruleTypes: ["deletion", "pull_request"],
				requiredChecks: ["Stale / Check"],
			}),
		});
		const problems = byId(report.rows, "repo-protection").problems;
		expect(problems).toContain('ruleset enforcement: declared "active", found "evaluate"');
		expect(problems).toContain("missing ruleset rule non_fast_forward");
		expect(problems).toContain("missing ruleset rule required_status_checks");
		expect(problems).toContain("missing required check DCO");
		expect(problems).toContain("unexpected required check Stale / Check");
	});

	it("passes a strict ruleset whose rules and checks match what setup derives", async () => {
		let checks: string[] = [];
		const probe = await run(strict, {
			...base,
			getProperties: async () => ({}),
			listRulesets: async () => [RULESET],
			getRulesetDetail: async () => ({
				name: RULESET.name,
				enforcement: "active",
				ruleTypes: [],
				requiredChecks: [],
			}),
		});
		checks = byId(probe.report.rows, "repo-protection")
			.problems.filter((p) => p.startsWith("missing required check"))
			.map((p) => p.replace("missing required check ", ""));
		expect(checks).toContain("DCO");
		const { report } = await run(strict, {
			...base,
			getProperties: async () => ({}),
			listRulesets: async () => [RULESET],
			getRulesetDetail: async () => ({
				name: RULESET.name,
				enforcement: "active",
				ruleTypes: ["deletion", "non_fast_forward", "pull_request", "required_status_checks"],
				requiredChecks: checks,
			}),
		});
		expect(byId(report.rows, "repo-protection").status).toBe("ok");
	});

	it("skips, with the reason, when the plan has no rulesets API, and fails on any other error", async () => {
		const forbidden = await run(loadedWith({ repo: { protection: "balanced" } }), {
			...base,
			getProperties: async () => ({}),
			getRulesetDetail: async () => RULESET,
			listRulesets: async () => {
				throw new ProviderApiError("Forbidden", 403);
			},
		});
		expect(byId(forbidden.report.rows, "repo-protection")).toMatchObject({
			status: "skip",
			detail: expect.stringContaining("not available on this plan"),
		});
		const broken = await run(loadedWith({ repo: { protection: "balanced" } }), {
			...base,
			getProperties: async () => ({}),
			getRulesetDetail: async () => RULESET,
			listRulesets: async () => {
				throw new ProviderApiError("Boom", 500);
			},
		});
		expect(byId(broken.report.rows, "repo-protection").status).toBe("fail");
	});
});

describe("doctor repo — security", () => {
	const base = { listLabels: async () => labels() };

	it("names a feature that is off, and expects CodeQL default setup off when an advanced workflow replaces it", async () => {
		const { report } = await run(loadedWith({ tasks: ["security.codeScanning"] }), {
			...base,
			getSecurity: async () => ({ ...ALL_ON, vulnerabilityAlerts: false }),
		});
		expect(byId(report.rows, "repo-security").problems).toEqual([
			"security setting vulnerabilityAlerts: declared on, found off",
			"security setting codeScanningDefaultSetup: declared off, found on",
		]);
	});

	it("does not count a feature the provider did not report", async () => {
		const { report } = await run(loadedWith({ tasks: [{ name: "delivery.build" }] }), {
			...base,
			getSecurity: async () => ({ vulnerabilityAlerts: true }),
		});
		expect(byId(report.rows, "repo-security")).toMatchObject({ status: "ok", detail: "1 of 1 match" });
	});

	it("skips when the provider reported none of them", async () => {
		const { report } = await run(loadedWith(), { ...base, getSecurity: async () => ({}) });
		expect(byId(report.rows, "repo-security")).toMatchObject({
			status: "skip",
			detail: "the provider reported none of the security settings",
		});
	});
});

describe("doctor repo — what cannot be read", () => {
	it("prints to the console, loads its own plugins and logs with the default logger when not told otherwise", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
		const loaded = loadedWith({ providers: {} });
		const report = await runDoctorRepo({ loaded, context: { repoRoot: "/tmp/test" } });
		expect(report.status).toBe("skip");
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("checks only the homepage when only a homepage is declared, and only the description when only that is", async () => {
		const source = {
			getRepoInfo: async () => info(),
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
		};
		const home = await run(loadedWith({ homepage: "https://demo.dev" }), source);
		expect(byId(home.report.rows, "repo-description").detail).toBe("1 of 1 match");
		const desc = await run(loadedWith({ description: "A demo" }), source);
		expect(byId(desc.report.rows, "repo-description").detail).toBe("1 of 1 match");
	});

	it("checks the balanced settings alone when no default branch is declared, and a strict ruleset without extra checks", async () => {
		const { report } = await run(loadedWith({ repo: { protection: "strict" } }), {
			getRepoInfo: async () => info(),
			getProperties: async () => ({ holocron_branch_protection_level: "strict" }),
			listRulesets: async () => [{ id: 1, name: "holocron-default-branch", enforcement: "active" }],
			getRulesetDetail: async () => ({
				name: "holocron-default-branch",
				enforcement: "active",
				ruleTypes: ["deletion", "non_fast_forward", "pull_request"],
				requiredChecks: [],
			}),
			listLabels: async () => labels(),
			getSecurity: async () => ALL_ON,
		});
		expect(byId(report.rows, "repo-settings").detail).toBe(
			`${Object.keys(BALANCED_REPO_SETTINGS).length} of ${Object.keys(BALANCED_REPO_SETTINGS).length} match`
		);
		expect(byId(report.rows, "repo-protection").problems).toEqual([
			"missing ruleset rule required_status_checks",
			"missing required check DCO",
		]);
	});

	it("skips every row with the reason when there is no source provider", async () => {
		const { report, lines } = await run(loadedWith({ providers: {} }), null);
		expect(report.status).toBe("skip");
		expect(report.rows.every((r) => r.status === "skip" && r.detail.includes("source"))).toBe(true);
		expect(report.reason).toContain("source");
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 2 skipped");
	});

	it("skips a row whose read method the provider lacks, without hiding the rows it can read", async () => {
		const { report } = await run(loadedWith({ repo: { topics: ["a"] } }), { getSecurity: async () => ALL_ON });
		expect(report.rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["repo-topics", "skip", "provider does not implement getRepoInfo"],
			["repo-labels", "skip", "provider does not implement listLabels"],
			["repo-security", "ok", "6 of 6 match"],
		]);
		expect(report.status).toBe("ok");
	});

	it("skips a row when the token is missing, and fails one for any other error", async () => {
		const { report } = await run(loadedWith({ repo: { teams: ["a"] } }), {
			listTeamAccess: async () => {
				throw new MissingTokenError("needs the org token");
			},
			listLabels: async () => {
				throw new Error("boom");
			},
			getSecurity: async () => ALL_ON,
		});
		expect(byId(report.rows, "repo-teams")).toMatchObject({ status: "skip", detail: "needs the org token" });
		expect(byId(report.rows, "repo-labels")).toMatchObject({ status: "fail", detail: "boom" });
		expect(report.status).toBe("fail");
	});
});
