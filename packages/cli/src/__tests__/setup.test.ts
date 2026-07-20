import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../config.js";
import { runSetup, codecovContent } from "../commands/setup.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type PluginImporter } from "../loader.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return {
		resolved: resolveConfig(rawConfig),
		filepath: "/tmp/test/holocron.config.json",
	};
}

const SOURCE_DEFAULTS = {
	listWorkflowFiles: async () => [] as string[],
};

function makePlugin(name: string, caps: Record<string, unknown>) {
	// Merge SOURCE_DEFAULTS under any provided "source" capability so that
	// test stubs only need to specify the methods they care about.
	const merged = { ...caps };
	if (merged.source && typeof merged.source === "object") {
		merged.source = { ...SOURCE_DEFAULTS, ...(merged.source as Record<string, unknown>) };
	}
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(merged).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoaderWith(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(
		loaded.resolved,
		{ repoRoot: "/tmp/test", repo: "theholocron/holocron" },
		importer as unknown as PluginImporter
	);
}

describe("runSetup", () => {
	it("runs all six source security steps + reports ok for each", async () => {
		const calls: string[] = [];
		const source = {
			enableVulnerabilityAlerts: async () => {
				calls.push("vuln-alerts");
			},
			enableAutomatedSecurityFixes: async () => {
				calls.push("auto-sec-fixes");
			},
			enableSecretScanning: async () => {
				calls.push("secret-scan");
			},
			enablePrivateVulnerabilityReporting: async () => {
				calls.push("private-vuln");
			},
			enableDependencyGraph: async () => {
				calls.push("dep-graph");
			},
			enableCodeScanning: async () => {
				calls.push("code-scan");
				return "run 1";
			},
		};
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source }),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(calls).toEqual([
			"vuln-alerts",
			"auto-sec-fixes",
			"secret-scan",
			"private-vuln",
			"dep-graph",
			"code-scan",
		]);
		const securitySteps = report.steps.filter(
			(s) =>
				s.capability === "source" &&
				!s.step.startsWith("write") &&
				!s.step.startsWith("upsert") &&
				!s.step.startsWith("updateRepo")
		);
		expect(securitySteps).toHaveLength(6);
		expect(securitySteps.every((s) => s.status === "ok")).toBe(true);
	});

	it("soft-skips failed steps (continues subsequent capabilities)", async () => {
		const calls: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					list: async () => {
						calls.push("vault-list");
						return ["SECRET_A"];
					},
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {
						throw new Error("403 forbidden");
					},
					enableAutomatedSecurityFixes: async () => {
						calls.push("auto-sec-fixes");
					},
					enableSecretScanning: async () => {
						calls.push("secret-scan");
					},
					enablePrivateVulnerabilityReporting: async () => {
						calls.push("private-vuln");
					},
					enableDependencyGraph: async () => {
						calls.push("dep-graph");
					},
					enableCodeScanning: async () => {
						calls.push("code-scan");
						return "run 1";
					},
					writeRepoFile: async () => {},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(calls).toContain("vault-list");
		expect(calls).toContain("auto-sec-fixes"); // ran AFTER the failure
		const firstSource = report.steps.find((s) => s.step === "enableVulnerabilityAlerts");
		expect(firstSource?.status).toBe("fail");
		expect(firstSource?.message).toContain("403 forbidden");
		expect(report.summary.fail).toBe(1);
		expect(report.summary.ok).toBeGreaterThanOrEqual(4);
	});

	it("dry-run reports `dry-run` status without calling mutators", async () => {
		let called = false;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => ["X", "Y"] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {
						called = true;
					},
					enableAutomatedSecurityFixes: async () => {
						called = true;
					},
					enableSecretScanning: async () => {
						called = true;
					},
					enablePrivateVulnerabilityReporting: async () => {
						called = true;
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			loader,
			print: () => {},
		});

		expect(called).toBe(false); // mutators never ran
		const sourceSteps = report.steps.filter((s) => s.capability === "source");
		expect(sourceSteps.every((s) => s.status === "dry-run")).toBe(true);
		// Vault list still runs (read-only) even in dry-run.
		expect(report.steps.find((s) => s.capability === "vault")?.status).toBe("ok");
	});

	it("upserts staging + production environments when the capability is loaded", async () => {
		const created: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", environments: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				environments: {
					upsertEnvironment: async (env: { name: string }) => {
						created.push(env.name);
					},
				},
			}),
		});

		await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(created).toEqual(["staging", "production"]);
	});

	it("ensures the deployment project using the config project name", async () => {
		let ensuredName: string | null = null;
		const loaded = loadedFrom({
			name: "my-app",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					ensureProject: async (input: { name: string }) => {
						ensuredName = input.name;
						return { id: "prj_1", name: input.name };
					},
				},
			}),
		});

		await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(ensuredName).toBe("my-app");
	});

	it("reports already-exists for ensureWebhookApp when the provider supports it", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", auth: "clerk" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-clerk": makePlugin("clerk", {
				auth: {
					ensureWebhookApp: async () => ({ alreadyExists: true }),
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const authStep = report.steps.find((s) => s.capability === "auth");
		expect(authStep?.status).toBe("ok");
		expect(authStep?.message).toContain("exists");
	});

	it("skips auth setup when the provider does not implement ensureWebhookApp", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", auth: "clerk" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-clerk": makePlugin("clerk", {
				auth: {
					// Note: no ensureWebhookApp
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const authStep = report.steps.find((s) => s.capability === "auth");
		expect(authStep?.status).toBe("skip");
		expect(report.summary.skip).toBeGreaterThanOrEqual(1);
	});

	it("runs sync() once per tooling provider (many-cardinality)", async () => {
		const synced: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", tooling: ["postman", "storybook"] },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-postman": makePlugin("postman", {
				tooling: {
					providerName: "postman",
					sync: async () => {
						synced.push("postman");
					},
				},
			}),
			"@theholocron/holocron-plugin-storybook": makePlugin("storybook", {
				tooling: {
					providerName: "storybook",
					sync: async () => {
						synced.push("storybook");
					},
				},
			}),
		});

		await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(synced).toEqual(["postman", "storybook"]);
	});

	it("calls vault ensureProject + ensureEnvironment when the provider implements them", async () => {
		const projectCreated: string[] = [];
		const envsCreated: Array<[string, string]> = [];
		const loaded = loadedFrom({
			name: "my-app",
			providers: { vault: "doppler" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-doppler": makePlugin("doppler", {
				vault: {
					list: async () => [],
					ensureProject: async (name: string) => {
						projectCreated.push(name);
						return { alreadyExists: false };
					},
					ensureEnvironment: async (project: string, name: string) => {
						envsCreated.push([project, name]);
						return { alreadyExists: false };
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(projectCreated).toEqual(["my-app"]);
		expect(envsCreated).toEqual([
			["my-app", "dev"],
			["my-app", "stg"],
			["my-app", "prd"],
		]);
		const vaultSteps = report.steps.filter((s) => s.capability === "vault");
		expect(vaultSteps.find((s) => s.step.startsWith("ensureProject"))?.message).toContain("created");
		expect(vaultSteps.filter((s) => s.step.startsWith("ensureEnvironment"))).toHaveLength(3);
	});

	it("skips vault ensureProject + ensureEnvironment when the provider omits them (1P-shaped vaults)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => ["ONE"] },
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(report.steps.some((s) => s.step.startsWith("ensureProject"))).toBe(false);
		expect(report.steps.some((s) => s.step.startsWith("ensureEnvironment"))).toBe(false);
	});

	it("disables default CodeQL setup when codeql workflow is configured", async () => {
		let defaultSetupDisabled = false;
		let defaultSetupEnabled = false;
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint", "codeql"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					enableDependencyGraph: async () => {},
					enableCodeScanning: async () => {
						defaultSetupEnabled = true;
						return "run 1";
					},
					disableDefaultCodeScanning: async () => {
						defaultSetupDisabled = true;
					},
					writeWorkflowFile: async () => {},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(defaultSetupDisabled).toBe(true);
		expect(defaultSetupEnabled).toBe(false);
		const step = report.steps.find((s) => s.step === "disableDefaultCodeScanning");
		expect(step?.status).toBe("ok");
	});

	it("enables default CodeQL setup when no codeql workflow is configured", async () => {
		let defaultSetupEnabled = false;
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					enableDependencyGraph: async () => {},
					enableCodeScanning: async () => {
						defaultSetupEnabled = true;
						return "run 1";
					},
					writeWorkflowFile: async () => {},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(defaultSetupEnabled).toBe(true);
	});

	it("applies balanced repo settings + creates a ruleset when repo.protection is 'balanced'", async () => {
		let settingsApplied: Record<string, unknown> | null = null;
		let rulesetCreated: Record<string, unknown> | null = null;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "balanced" },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async (s: Record<string, unknown>) => {
						settingsApplied = s;
					},
					listRulesets: async () => [],
					createRuleset: async (p: Record<string, unknown>) => {
						rulesetCreated = p;
						return { id: 1, name: "holocron-default-branch", enforcement: "active" };
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(settingsApplied).not.toBeNull();
		expect(settingsApplied).toMatchObject({ allow_squash_merge: true, allow_auto_merge: true, has_wiki: false });
		expect(rulesetCreated).not.toBeNull();
		expect(rulesetCreated).toMatchObject({ name: "holocron-default-branch", enforcement: "active" });
		// balanced has no required_status_checks rule
		const rules = (rulesetCreated as unknown as { rules: Array<{ type: string }> }).rules;
		expect(rules.some((r) => r.type === "required_status_checks")).toBe(false);
		const policySteps = report.steps.filter((s) => s.capability === "source" && s.step === "updateRepoSettings");
		expect(policySteps[0]?.status).toBe("ok");
	});

	it("derives required_status_checks from configured workflows when repo.protection is 'strict'", async () => {
		let rulesetPayload: Record<string, unknown> | null = null;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "strict" },
			workflows: ["lint", "test", "typecheck"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {},
					listRulesets: async () => [],
					createRuleset: async (p: Record<string, unknown>) => {
						rulesetPayload = p;
						return { id: 1, name: "holocron-default-branch", enforcement: "active" };
					},
					writeWorkflowFile: async () => {},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(rulesetPayload).not.toBeNull();
		const rules = (rulesetPayload as unknown as { rules: Array<{ type: string; parameters?: unknown }> }).rules;
		const checksRule = rules.find((r) => r.type === "required_status_checks");
		expect(checksRule).toBeDefined();
		expect(checksRule?.parameters).toMatchObject({
			required_status_checks: [
				{ context: "DCO" },
				{ context: "Lint / Lint entire codebase" },
				{ context: "Test / Run tests and collect coverage" },
				{ context: "Typecheck / tsc --noEmit" },
			],
		});
	});

	it("appends extra requiredChecks from config to the auto-derived list", async () => {
		let rulesetPayload: Record<string, unknown> | null = null;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "strict", requiredChecks: ["some-extra-check"] },
			workflows: ["lint"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {},
					listRulesets: async () => [],
					createRuleset: async (p: Record<string, unknown>) => {
						rulesetPayload = p;
						return { id: 1, name: "holocron-default-branch", enforcement: "active" };
					},
					writeWorkflowFile: async () => {},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const rules = (rulesetPayload as unknown as { rules: Array<{ type: string; parameters?: unknown }> }).rules;
		const checksRule = rules.find((r) => r.type === "required_status_checks");
		expect(checksRule?.parameters).toMatchObject({
			required_status_checks: [
				{ context: "DCO" },
				{ context: "Lint / Lint entire codebase" },
				{ context: "some-extra-check" },
			],
		});
	});

	it("updates an existing ruleset instead of creating a new one", async () => {
		const created: unknown[] = [];
		const updated: unknown[] = [];
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "balanced" },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {},
					listRulesets: async () => [{ id: 42, name: "holocron-default-branch", enforcement: "active" }],
					createRuleset: async (p: unknown) => {
						created.push(p);
						return { id: 99, name: "holocron-default-branch", enforcement: "active" };
					},
					updateRuleset: async (_id: number, p: unknown) => {
						updated.push(p);
						return { id: 42, name: "holocron-default-branch", enforcement: "active" };
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(created).toHaveLength(0);
		expect(updated).toHaveLength(1);
		const rulesetStep = report.steps.find((s) => s.step.includes("ruleset"));
		expect(rulesetStep?.status).toBe("ok");
		expect(rulesetStep?.message).toBe("updated");
	});

	it("skips repo policy steps when repo.protection is 'none'", async () => {
		let settingsCalled = false;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "none" },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {
						settingsCalled = true;
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(settingsCalled).toBe(false);
		expect(report.steps.some((s) => s.step === "updateRepoSettings")).toBe(false);
		expect(report.steps.some((s) => s.step.includes("ruleset"))).toBe(false);
	});

	it("skips repo policy steps when no protection in config", async () => {
		let settingsCalled = false;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {
						settingsCalled = true;
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(settingsCalled).toBe(false);
	});

	it("writes thin wrapper files for each workflow listed in project.workflows", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint", "test", "typecheck"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeWorkflowFile: async (name: string, contents: string) => {
						written[name] = contents;
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(Object.keys(written)).toEqual(["lint.yml", "test.yml", "typecheck.yml"]);
		expect(written["lint.yml"]).toContain("lint.yml@main");
		expect(written["test.yml"]).toContain("test.yml@main");
		const workflowSteps = report.steps.filter((s) => s.step.startsWith("write workflow"));
		expect(workflowSteps).toHaveLength(3);
		expect(workflowSteps.every((s) => s.status === "ok")).toBe(true);
	});

	it("skips workflow writing when project.workflows is absent", async () => {
		let writeCallCount = 0;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeWorkflowFile: async () => {
						writeCallCount++;
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(writeCallCount).toBe(0);
	});

	it("reports skip for an unknown workflow name", async () => {
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint", "not-a-real-workflow"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeWorkflowFile: async () => {},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		const unknownStep = report.steps.find((s) => s.step === "write workflow not-a-real-workflow");
		expect(unknownStep?.status).toBe("skip");
		expect(unknownStep?.message).toContain("unknown workflow");
	});

	it("dry-run skips workflow writes", async () => {
		let writeCallCount = 0;
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint", "test"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeWorkflowFile: async () => {
						writeCallCount++;
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			loader,
			print: () => {},
		});

		expect(writeCallCount).toBe(0);
		const workflowSteps = report.steps.filter((s) => s.step.startsWith("write workflow"));
		expect(workflowSteps.every((s) => s.status === "dry-run")).toBe(true);
	});

	it("output includes a header + summary line", async () => {
		const lines: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => ["ONE"] },
			}),
		});

		await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: (l) => lines.push(l),
		});

		const joined = lines.join("\n");
		expect(joined).toMatch(/Holocron setup — demo/);
		expect(joined).toMatch(/1 ok, 0 fail/);
	});

	it("writes .alexrc.json whenever source is available", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async (path: string, content: string) => {
						written[path] = content;
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
		});

		expect(written[".alexrc.json"]).toBeDefined();
		const parsed = JSON.parse(written[".alexrc.json"]!);
		expect(parsed.allow).toContain("hooks");
		expect(parsed.allow).toContain("hook");
		const step = report.steps.find((s) => s.step === "write .alexrc.json");
		expect(step?.status).toBe("ok");

		expect(written[".editorconfig"]).toBeDefined();
		expect(written[".editorconfig"]).toContain("AUTO-GENERATED — do not edit directly");
		expect(written[".editorconfig"]).toContain("indent_style = tab");
		expect(written[".editorconfig"]).toContain("[*.{json,yml,yaml}]");
		expect(written[".editorconfig"]).toContain("indent_style = space");
		expect(written[".editorconfig"]).toContain("indent_size = 2");
		expect(written[".editorconfig"]).toMatch(/\n$/);
		const editorStep = report.steps.find((s) => s.step === "write .editorconfig");
		expect(editorStep?.status).toBe("ok");

		expect(written[".editorconfig-checker.json"]).toBeDefined();
		const checker = JSON.parse(written[".editorconfig-checker.json"]!);
		expect(checker.Exclude).toContain("(^|.+/)LICENSE$");
		expect(written[".editorconfig-checker.json"]).toMatch(/\n$/);
		const checkerStep = report.steps.find((s) => s.step === "write .editorconfig-checker.json");
		expect(checkerStep?.status).toBe("ok");
	});

	it("writes .github/labeler.yml when bookkeeping-pr workflow is configured", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint", "bookkeeping-pr"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeWorkflowFile: async () => {},
					writeRepoFile: async (path: string, content: string) => {
						written[path] = content;
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(written[".github/labeler.yml"]).toBeDefined();
		expect(written[".github/labeler.yml"]).toContain("AUTO-GENERATED — do not edit directly");
		expect(written[".github/labeler.yml"]).toContain("^fix");
		expect(written[".github/labeler.yml"]).toContain("^docs");
		expect(written[".github/labeler.yml"]).toMatch(/\n$/);
		const step = report.steps.find((s) => s.step === "write .github/labeler.yml");
		expect(step?.status).toBe("ok");
	});

	it("does not write .github/labeler.yml when bookkeeping-pr is not configured", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint", "test"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeWorkflowFile: async () => {},
					writeRepoFile: async (path: string, content: string) => {
						written[path] = content;
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(written[".github/labeler.yml"]).toBeUndefined();
	});

	it("calls syncProperties with derived and manual properties when source supports it", async () => {
		let captured: Record<string, string> | null = null;
		const loaded = loadedFrom({
			name: "demo",
			repo: {
				name: "theholocron/demo",
				protection: "strict",
				properties: {
					lifecycle: "active",
					open_source: true,
					runtime_environment: "node",
					uses_external_packages: false,
				},
			},
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					enableDependencyGraph: async () => {},
					enableCodeScanning: async () => "run 1",
					updateRepoSettings: async () => {},
					listRulesets: async () => [],
					createRuleset: async () => ({ id: 1, name: "holocron-default-branch", enforcement: "active" }),
					writeRepoFile: async () => {},
					syncProperties: async (values: Record<string, string>) => {
						captured = values;
						return `${Object.keys(values).length} properties set`;
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(captured).not.toBeNull();
		expect(captured!["branch_protection_level"]).toBe("strict");
		expect(captured!["monorepo"]).toBe("false"); // /tmp/test has no pnpm-workspace.yaml
		expect(captured!["lifecycle"]).toBe("active");
		expect(captured!["open_source"]).toBe("true");
		expect(captured!["runtime_environment"]).toBe("node");
		expect(captured!["uses_external_packages"]).toBe("false");
		const step = report.steps.find((s) => s.step === "sync properties");
		expect(step?.status).toBe("ok");
		expect(step?.message).toContain("properties set");
	});

	it("does not set branch_protection_level property when no protection is configured", async () => {
		let captured: Record<string, string> | null = null;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", properties: { lifecycle: "experimental" } },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncProperties: async (values: Record<string, string>) => {
						captured = values;
						return `${Object.keys(values).length} properties set`;
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(captured).not.toBeNull();
		expect(captured!["branch_protection_level"]).toBeUndefined();
		expect(captured!["lifecycle"]).toBe("experimental");
	});

	it("calls syncTopics with the configured topics", async () => {
		let capturedTopics: string[] | null = null;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", topics: ["cli", "nodejs", "typescript"] },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncTopics: async (topics: string[]) => {
						capturedTopics = topics;
						return `${topics.length} topics set`;
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(capturedTopics).toEqual(["cli", "nodejs", "typescript"]);
		const step = report.steps.find((s) => s.step === "sync topics");
		expect(step?.status).toBe("ok");
		expect(step?.message).toBe("3 topics set");
	});

	it("skips syncTopics when topics list is empty", async () => {
		let called = false;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", topics: [] },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncTopics: async () => {
						called = true;
						return "0 topics set";
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(called).toBe(false);
		expect(report.steps.some((s) => s.step === "sync topics")).toBe(false);
	});

	it("skips syncTopics when repo has no topics field", async () => {
		let called = false;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncTopics: async () => {
						called = true;
						return "0 topics set";
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(called).toBe(false);
	});

	it("skips dependabot when repo.protection is 'none'", async () => {
		const written: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "none" },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async (path: string) => {
						written.push(path);
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(written).not.toContain(".github/dependabot.yml");
	});

	it("writes dependabot when no protection is configured (effectivePreset undefined)", async () => {
		const written: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async (path: string) => {
						written.push(path);
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(written).toContain(".github/dependabot.yml");
	});

	it("dry-run does not write .alexrc.json", async () => {
		let writeCalled = false;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { list: async () => [] },
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {
						writeCalled = true;
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			loader,
			print: () => {},
		});

		expect(writeCalled).toBe(false);
		const step = report.steps.find((s) => s.step === "write .alexrc.json");
		expect(step?.status).toBe("dry-run");
	});

	it("calls source.syncLabels when the provider implements it", async () => {
		let called = false;
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => {
						called = true;
						return "17 synced";
					},
					writeRepoFile: async () => {},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(called).toBe(true);
		const step = report.steps.find((s) => s.step === "sync labels");
		expect(step?.status).toBe("ok");
		expect(step?.message).toBe("17 synced");
	});
});

// ── codecovContent ────────────────────────────────────────────────────────────

describe("codecovContent", () => {
	it("includes standard coverage thresholds and comment layout", () => {
		const out = codecovContent([]);
		expect(out).toContain("require_ci_to_pass: true");
		expect(out).toContain("target: auto");
		expect(out).toContain("target: 80%");
		expect(out).toContain('layout: "reach,diff,flags,components"');
		expect(out).toContain("require_changes: true");
	});

	it("produces individual_components entry for each package", () => {
		const out = codecovContent([
			{ slug: "http-client", name: "@theholocron/http-client" },
			{ slug: "clerk-client", name: "@theholocron/clerk-client" },
		]);
		expect(out).toContain("component_id: http-client");
		expect(out).toContain('name: "@theholocron/http-client"');
		expect(out).toContain("- packages/http-client/**");
		expect(out).toContain("component_id: clerk-client");
		expect(out).toContain('name: "@theholocron/clerk-client"');
		expect(out).toContain("- packages/clerk-client/**");
	});

	it("produces empty individual_components list when no packages are given", () => {
		const out = codecovContent([]);
		expect(out).toContain("individual_components:");
		expect(out).toContain("[]");
	});

	it("ends with a trailing newline", () => {
		expect(codecovContent([])).toMatch(/\n$/);
	});
});

// ── setup: write codecov.yml ──────────────────────────────────────────────────

describe("setup: write codecov.yml", () => {
	let tmpDir: string;
	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-setup-"));
	});
	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	function makeLoaderWithSource(repoRoot: string, source: Record<string, unknown>): PluginLoader {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: join(repoRoot, "holocron.config.json"),
		};
		const importer = vi.fn(async () => ({
			createPlugin: () => ({
				name: "gh",
				capabilities: { source: () => ({ listWorkflowFiles: async () => [], ...source }) },
			}),
		}));
		return new PluginLoader(
			loaded.resolved,
			{ repoRoot, repo: "theholocron/demo" },
			importer as unknown as PluginImporter
		);
	}

	it("writes codecov.yml with discovered packages", async () => {
		const pkgsDir = join(tmpDir, "packages");
		await mkdir(join(pkgsDir, "foo"), { recursive: true });
		await mkdir(join(pkgsDir, "bar"), { recursive: true });
		await writeFile(join(pkgsDir, "foo", "package.json"), JSON.stringify({ name: "@acme/foo" }));
		await writeFile(join(pkgsDir, "bar", "package.json"), JSON.stringify({ name: "@acme/bar" }));

		const written: Record<string, string> = {};
		const loader = makeLoaderWithSource(tmpDir, {
			writeRepoFile: async (path: string, content: string) => {
				written[path] = content;
			},
		});

		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: join(tmpDir, "holocron.config.json"),
		};
		await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		expect(written["codecov.yml"]).toBeDefined();
		expect(written["codecov.yml"]).toContain("component_id: bar");
		expect(written["codecov.yml"]).toContain("component_id: foo");
		const step = (await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} })).steps.find(
			(s) => s.step === "write codecov.yml"
		);
		expect(step?.message).toBe("2 components");
	});

	it("writes codecov.yml with empty components when packages/ is absent", async () => {
		const written: Record<string, string> = {};
		const loader = makeLoaderWithSource(tmpDir, {
			writeRepoFile: async (path: string, content: string) => {
				written[path] = content;
			},
		});
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: join(tmpDir, "holocron.config.json"),
		};

		const report = await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		expect(written["codecov.yml"]).toContain("individual_components:");
		const step = report.steps.find((s) => s.step === "write codecov.yml");
		expect(step?.status).toBe("ok");
		expect(step?.message).toBe("no components");
	});

	it("skips package dirs without a package.json", async () => {
		const pkgsDir = join(tmpDir, "packages");
		await mkdir(join(pkgsDir, "foo"), { recursive: true });
		await mkdir(join(pkgsDir, "no-pkg"), { recursive: true });
		await writeFile(join(pkgsDir, "foo", "package.json"), JSON.stringify({ name: "@acme/foo" }));

		const written: Record<string, string> = {};
		const loader = makeLoaderWithSource(tmpDir, {
			writeRepoFile: async (path: string, content: string) => {
				written[path] = content;
			},
		});
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: join(tmpDir, "holocron.config.json"),
		};

		await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		expect(written["codecov.yml"]).toContain("component_id: foo");
		expect(written["codecov.yml"]).not.toContain("no-pkg");
	});

	it("skips non-directory entries (files) inside packages/", async () => {
		const pkgsDir = join(tmpDir, "packages");
		await mkdir(join(pkgsDir, "real-pkg"), { recursive: true });
		await writeFile(join(pkgsDir, "real-pkg", "package.json"), JSON.stringify({ name: "@acme/real-pkg" }));
		// A plain file sitting directly in packages/ — should be ignored
		await writeFile(join(pkgsDir, "README.md"), "# packages");

		const written: Record<string, string> = {};
		const loader = makeLoaderWithSource(tmpDir, {
			writeRepoFile: async (path: string, content: string) => {
				written[path] = content;
			},
		});
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: join(tmpDir, "holocron.config.json"),
		};

		await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		expect(written["codecov.yml"]).toContain("component_id: real-pkg");
		expect(written["codecov.yml"]).not.toContain("README");
	});

	it("skips package dirs whose package.json has no name field", async () => {
		const pkgsDir = join(tmpDir, "packages");
		await mkdir(join(pkgsDir, "named"), { recursive: true });
		await mkdir(join(pkgsDir, "unnamed"), { recursive: true });
		await writeFile(join(pkgsDir, "named", "package.json"), JSON.stringify({ name: "@acme/named" }));
		await writeFile(join(pkgsDir, "unnamed", "package.json"), JSON.stringify({ version: "1.0.0" }));

		const written: Record<string, string> = {};
		const loader = makeLoaderWithSource(tmpDir, {
			writeRepoFile: async (path: string, content: string) => {
				written[path] = content;
			},
		});
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: join(tmpDir, "holocron.config.json"),
		};

		await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		expect(written["codecov.yml"]).toContain("component_id: named");
		expect(written["codecov.yml"]).not.toContain("unnamed");
	});
});
