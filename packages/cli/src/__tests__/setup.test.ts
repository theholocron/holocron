import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderApiError } from "../capabilities/index.js";
import { codecovContent, mergeCodecovComponents, runSetup } from "../commands/setup.js";
import { resolveConfig } from "../config.js";
import type { LoadedConfig } from "../load-config.js";
import { type PluginImporter, PluginLoader } from "../loader.js";

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
		expect(sourceSteps.every((s) => s.status === "dry-run" || s.status === "skip")).toBe(true);
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

	it("skips enableSecretScanning when the API returns 422 (public repo)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {
						throw new ProviderApiError("already enabled", 422);
					},
					enablePrivateVulnerabilityReporting: async () => {},
					enableDependencyGraph: async () => {},
					enableCodeScanning: async () => "run 1",
					writeRepoFile: async () => {},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const step = report.steps.find((s) => s.step === "enableSecretScanning");
		expect(step?.status).toBe("skip");
		expect(report.summary.fail).toBe(0);
	});

	it("skips enablePrivateVulnerabilityReporting when the API returns 404 (public repo)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {
						throw new ProviderApiError("not found", 404);
					},
					enableDependencyGraph: async () => {},
					enableCodeScanning: async () => "run 1",
					writeRepoFile: async () => {},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const step = report.steps.find((s) => s.step === "enablePrivateVulnerabilityReporting");
		expect(step?.status).toBe("skip");
		expect(report.summary.fail).toBe(0);
	});

	it("skips disableDefaultCodeScanning when the API returns 403 plan restriction", async () => {
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["codeql"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					enableDependencyGraph: async () => {},
					disableDefaultCodeScanning: async () => {
						throw new ProviderApiError("GitHub Advanced Security is not enabled", 403);
					},
					writeWorkflowFile: async () => {},
					writeRepoFile: async () => {},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const step = report.steps.find((s) => s.step === "disableDefaultCodeScanning");
		expect(step?.status).toBe("skip");
		expect(step?.reason).toBe("plan");
		expect(report.summary.fail).toBe(0);
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

	it("fails immediately when rulesets throw a non-403 error", async () => {
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "balanced" },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {},
					listRulesets: async () => {
						throw new ProviderApiError("server error", 500);
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const rulesetStep = report.steps.find((s) => s.step.includes("ruleset"));
		expect(rulesetStep?.status).toBe("fail");
		expect(rulesetStep?.message).toContain("server error");
	});

	it("falls back to classic protection when rulesets return 403", async () => {
		let classicPayload: Record<string, unknown> | null = null;
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "strict" },
			workflows: ["lint", "test"],
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {},
					listRulesets: async () => {
						throw new ProviderApiError("forbidden", 403);
					},
					getRepo: async () => ({ defaultBranch: "main" }),
					protectBranch: async (_branch: string, payload: Record<string, unknown>) => {
						classicPayload = payload;
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const rulesetStep = report.steps.find((s) => s.step.includes("ruleset"));
		expect(rulesetStep?.status).toBe("ok");
		expect(rulesetStep?.message).toBe("classic protection on main");
		// strict + workflows → required_status_checks should be set (covers buildClassicProtectionPayload with checks)
		expect((classicPayload as unknown as Record<string, unknown>)?.required_status_checks).not.toBeNull();
	});

	it("skips when classic protection also returns 403", async () => {
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "balanced" },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {},
					listRulesets: async () => {
						throw new ProviderApiError("forbidden", 403);
					},
					getRepo: async () => ({ defaultBranch: "main" }),
					protectBranch: async () => {
						throw new ProviderApiError("forbidden", 403);
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const rulesetStep = report.steps.find((s) => s.step.includes("ruleset"));
		expect(rulesetStep?.status).toBe("skip");
		expect(rulesetStep?.message).toContain("GitHub Pro/Team");
	});

	it("fails when classic protection throws a non-403 error", async () => {
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", protection: "balanced" },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					updateRepoSettings: async () => {},
					listRulesets: async () => {
						throw new ProviderApiError("forbidden", 403);
					},
					getRepo: async () => ({ defaultBranch: "main" }),
					protectBranch: async () => {
						throw new ProviderApiError("unprocessable", 422);
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });
		const rulesetStep = report.steps.find((s) => s.step.includes("ruleset"));
		expect(rulesetStep?.status).toBe("fail");
		expect(rulesetStep?.message).toContain("unprocessable");
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

	it("throws ConfigError when test workflow has both run-unit and run-storybook set to false", async () => {
		const loaded = loadedFrom({
			name: "demo",
			workflows: [{ name: "test", with: { "run-unit": false, "run-storybook": false } }],
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
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

		await expect(runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} })).rejects.toThrow(
			"at least one of"
		);
	});

	it("does not throw when test workflow has run-unit: true and run-storybook: false", async () => {
		const written: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			workflows: [{ name: "test", with: { "run-unit": true, "run-storybook": false } }],
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeWorkflowFile: async (_: string, content: string) => {
						written.push(content);
					},
				},
			}),
		});

		await expect(
			runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} })
		).resolves.not.toThrow();
		expect(written.some((c) => c.includes("run-unit: true"))).toBe(true);
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

	it("writes .github/labeler.yml when bookkeeping workflow is configured", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			workflows: ["lint", "bookkeeping"],
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

	it("does not write .github/labeler.yml when bookkeeping is not configured", async () => {
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

	it("calls syncDescription when description is set in config", async () => {
		let captured: string | null = null;
		const loaded = loadedFrom({
			name: "demo",
			description: "A great CLI tool",
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncDescription: async (desc: string) => {
						captured = desc;
						return "description updated";
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(captured).toBe("A great CLI tool");
		const step = report.steps.find((s) => s.step === "sync description");
		expect(step?.status).toBe("ok");
	});

	it("skips syncDescription when description is absent from config", async () => {
		let called = false;
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncDescription: async () => {
						called = true;
						return "description updated";
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(called).toBe(false);
	});

	it("calls syncHomepage when homepage is set in config", async () => {
		let captured: string | null = null;
		const loaded = loadedFrom({
			name: "demo",
			homepage: "https://docs.example.com",
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncHomepage: async (url: string) => {
						captured = url;
						return "homepage updated";
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(captured).toBe("https://docs.example.com");
		const step = report.steps.find((s) => s.step === "sync homepage");
		expect(step?.status).toBe("ok");
	});

	it("skips syncHomepage when homepage is absent from config", async () => {
		let called = false;
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					writeRepoFile: async () => {},
					syncHomepage: async () => {
						called = true;
						return "homepage updated";
					},
				},
			}),
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(called).toBe(false);
	});

	it("calls syncTeams and writes CODEOWNERS for writeable teams", async () => {
		let capturedTeams: unknown = null;
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", teams: ["gatekeepers"] },
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
					syncTeams: async (teams: unknown) => {
						capturedTeams = teams;
						return "1 team synced";
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test", repo: "theholocron/demo" },
			loader,
			print: () => {},
		});

		expect(capturedTeams).toEqual(["gatekeepers"]);
		const teamsStep = report.steps.find((s) => s.step === "sync teams");
		expect(teamsStep?.status).toBe("ok");
		expect(teamsStep?.message).toBe("1 team synced");
		const codeownersStep = report.steps.find((s) => s.step === "write .github/CODEOWNERS");
		expect(codeownersStep?.status).toBe("ok");
		expect(written[".github/CODEOWNERS"]).toBe("* @theholocron/gatekeepers\n");
	});

	it("skips sync teams when the API returns 422 (team already assigned)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", teams: [{ slug: "gatekeepers", permission: "maintain" as const }] },
			providers: { vault: "1password", source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					enableVulnerabilityAlerts: async () => {},
					enableAutomatedSecurityFixes: async () => {},
					enableSecretScanning: async () => {},
					enablePrivateVulnerabilityReporting: async () => {},
					enableDependencyGraph: async () => {},
					enableCodeScanning: async () => "run 1",
					writeRepoFile: async () => {},
					syncTeams: async () => {
						throw new ProviderApiError("team already has access", 422);
					},
				},
			}),
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test", repo: "theholocron/demo" },
			loader,
			print: () => {},
		});
		const teamsStep = report.steps.find((s) => s.step === "sync teams");
		expect(teamsStep?.status).toBe("skip");
		expect(report.summary.fail).toBe(0);
	});

	it("skips CODEOWNERS when all teams have pull/triage permission only", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", teams: [{ slug: "readers", permission: "pull" as const }] },
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
					syncTeams: async () => "1 team synced",
				},
			}),
		});

		await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test", repo: "theholocron/demo" },
			loader,
			print: () => {},
		});

		expect(written[".github/CODEOWNERS"]).toBeUndefined();
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

	it("records explicit skip when source does not implement syncTeams", async () => {
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", teams: ["gatekeepers"] },
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
					// syncTeams intentionally omitted
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "sync teams");
		expect(step?.status).toBe("skip");
		expect(step?.message).toContain("does not implement syncTeams");
	});

	it("skips CODEOWNERS write when repo coord has no owner prefix", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			// bare name — no "owner/" prefix
			repo: { name: "demo", teams: ["gatekeepers"] },
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
					syncTeams: async () => "1 team synced",
				},
			}),
		});

		// context.repo not set either — no valid org to derive
		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(written[".github/CODEOWNERS"]).toBeUndefined();
	});

	it("records skip (not ok) when agent is unsupported", async () => {
		const loaded = loadedFrom({
			name: "demo",
			agent: "codex",
			skills: ["git-safety"],
			providers: {},
		});
		const loader = makeLoaderWith(loaded, {});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.capability === "skills");
		expect(step?.status).toBe("skip");
		expect(step?.message).toContain("codex");
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

// ── 403 reason classification and hint ────────────────────────────────────────

describe("runSetup — 403 handling", () => {
	const loaded = (() => {
		const r = resolveConfig({ name: "demo", providers: { source: "github" } });
		return { resolved: r, filepath: "/tmp/test/holocron.config.json" };
	})();

	function makeLoaderWithSource(source: Record<string, unknown>): PluginLoader {
		const importer = vi.fn(async () => ({
			createPlugin: () => ({
				name: "gh",
				capabilities: {
					source: () => ({ listWorkflowFiles: async () => [], ...source }),
				},
			}),
		}));
		return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
	}

	it("tags a generic 403 as permissions and attaches reason to the step", async () => {
		const loader = makeLoaderWithSource({
			enableVulnerabilityAlerts: async () => {
				throw new ProviderApiError("Must have admin rights to Repository.", 403);
			},
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "enableVulnerabilityAlerts");
		expect(step?.status).toBe("fail");
		expect(step?.reason).toBe("permissions");
	});

	it("tags a plan-restriction 403 as plan when message is in err.message", async () => {
		const loader = makeLoaderWithSource({
			enableSecretScanning: async () => {
				throw new ProviderApiError("GitHub Advanced Security is not enabled for this repository.", 403);
			},
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "enableSecretScanning");
		expect(step?.reason).toBe("plan");
	});

	it("tags a plan-restriction 403 as plan when detail is in err.details object body", async () => {
		const loader = makeLoaderWithSource({
			enableSecretScanning: async () => {
				throw new ProviderApiError("Forbidden", 403, {
					message: "GitHub Advanced Security is not enabled for this repository.",
				});
			},
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "enableSecretScanning");
		expect(step?.reason).toBe("plan");
	});

	it("tags a plan-restriction 403 as plan when err.details is a plain string body", async () => {
		const loader = makeLoaderWithSource({
			enableSecretScanning: async () => {
				throw new ProviderApiError(
					"Forbidden",
					403,
					"GitHub Advanced Security is not enabled for this repository."
				);
			},
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "enableSecretScanning");
		expect(step?.reason).toBe("plan");
	});

	it("does not set reason for non-403 errors", async () => {
		const loader = makeLoaderWithSource({
			enableVulnerabilityAlerts: async () => {
				throw new Error("network timeout");
			},
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "enableVulnerabilityAlerts");
		expect(step?.status).toBe("fail");
		expect(step?.reason).toBeUndefined();
	});

	it("emits the PAT hint in output when there is a permissions 403", async () => {
		const lines: string[] = [];
		const loader = makeLoaderWithSource({
			enableVulnerabilityAlerts: async () => {
				throw new ProviderApiError("Must have admin rights.", 403);
			},
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: (l) => lines.push(l) });

		const output = lines.join("\n");
		expect(output).toContain("⚠");
		expect(output).toContain("insufficient token permissions");
		expect(output).toContain("personal-access-tokens/new");
		expect(output).toContain("--token <your-admin-pat>");
	});

	it("does not emit the hint when all failures are plan restrictions", async () => {
		const lines: string[] = [];
		const loader = makeLoaderWithSource({
			enableSecretScanning: async () => {
				throw new ProviderApiError("GitHub Advanced Security is not enabled for this repository.", 403);
			},
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: (l) => lines.push(l) });

		expect(lines.join("\n")).not.toContain("personal-access-tokens/new");
	});

	it("formatStep includes [permissions] tag in the printed line", async () => {
		const lines: string[] = [];
		const loader = makeLoaderWithSource({
			enableVulnerabilityAlerts: async () => {
				throw new ProviderApiError("Must have admin rights.", 403);
			},
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: (l) => lines.push(l) });

		const stepLine = lines.find((l) => l.includes("enableVulnerabilityAlerts"));
		expect(stepLine).toMatch(/\[permissions\]/);
	});

	it("formatStep includes [plan restriction] tag for plan 403s", async () => {
		const lines: string[] = [];
		const loader = makeLoaderWithSource({
			enableSecretScanning: async () => {
				throw new ProviderApiError("GitHub Advanced Security is not enabled for this repository.", 403);
			},
		});

		await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: (l) => lines.push(l) });

		const stepLine = lines.find((l) => l.includes("enableSecretScanning"));
		expect(stepLine).toMatch(/\[plan restriction\]/);
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

	it("produces individual_components entry for each package using slug as name", () => {
		const out = codecovContent([
			{ slug: "http-client", name: "@theholocron/http-client" },
			{ slug: "clerk-client", name: "@theholocron/clerk-client" },
		]);
		expect(out).toContain("component_id: http-client");
		expect(out).toContain('name: "http-client"');
		expect(out).not.toContain("@theholocron/");
		expect(out).toContain("- packages/http-client/**");
		expect(out).toContain("component_id: clerk-client");
		expect(out).toContain('name: "clerk-client"');
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

// ── mergeCodecovComponents ────────────────────────────────────────────────────

describe("mergeCodecovComponents", () => {
	const existing = [
		"codecov:",
		"  require_ci_to_pass: true",
		"",
		"coverage:",
		'  range: "70...100"',
		"  status:",
		"    patch:",
		"      default:",
		"        threshold: 2%",
		"",
		"component_management:",
		"  default_rules:",
		"    statuses:",
		"      - type: patch",
		"        target: 80%",
		"  individual_components:",
		"    - component_id: old-pkg",
		'      name: "old-pkg"',
		"      paths:",
		"        - packages/old-pkg/**",
		"",
	].join("\n");

	it("replaces individual_components block while preserving the rest of the file", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "new-pkg", name: "@acme/new-pkg" }]);
		expect(out).toContain('range: "70...100"');
		expect(out).toContain("threshold: 2%");
		expect(out).toContain("component_id: new-pkg");
		expect(out).not.toContain("old-pkg");
	});

	it("uses slug as the component name, not the npm package name", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "foo", name: "@acme/foo" }]);
		expect(out).toContain('name: "foo"');
		expect(out).not.toContain("@acme/");
	});

	it("returns the file unchanged when individual_components marker is absent", () => {
		const noMarker = "codecov:\n  require_ci_to_pass: true\n";
		expect(mergeCodecovComponents(noMarker, [{ slug: "foo", name: "@acme/foo" }])).toBe(noMarker);
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

	it("skips writing codecov.yml when packages/ is absent and no existing file", async () => {
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

		expect(written["codecov.yml"]).toBeUndefined();
		const step = report.steps.find((s) => s.step === "write codecov.yml");
		expect(step?.status).toBe("skip");
		expect(step?.message).toBe("no packages and no existing codecov.yml");
	});

	it("merges existing codecov.yml even when packages/ is absent", async () => {
		const existingCodecov = [
			"codecov:",
			"  require_ci_to_pass: true",
			"",
			"component_management:",
			"  individual_components: []",
			"",
		].join("\n");
		await writeFile(join(tmpDir, "codecov.yml"), existingCodecov);

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

		expect(written["codecov.yml"]).toBeDefined();
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

	it("merges components into an existing codecov.yml without overwriting custom settings", async () => {
		const existingCodecov = [
			"codecov:",
			"  require_ci_to_pass: true",
			"",
			"coverage:",
			'  range: "70...100"',
			"  status:",
			"    patch:",
			"      default:",
			"        threshold: 2%",
			"",
			"component_management:",
			"  default_rules:",
			"    statuses:",
			"      - type: patch",
			"        target: 80%",
			"  individual_components:",
			"    - component_id: old-pkg",
			'      name: "old-pkg"',
			"      paths:",
			"        - packages/old-pkg/**",
			"",
		].join("\n");
		await writeFile(join(tmpDir, "codecov.yml"), existingCodecov);

		const pkgsDir = join(tmpDir, "packages");
		await mkdir(join(pkgsDir, "new-pkg"), { recursive: true });
		await writeFile(join(pkgsDir, "new-pkg", "package.json"), JSON.stringify({ name: "@acme/new-pkg" }));

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

		expect(written["codecov.yml"]).toContain('range: "70...100"');
		expect(written["codecov.yml"]).toContain("threshold: 2%");
		expect(written["codecov.yml"]).toContain("component_id: new-pkg");
		expect(written["codecov.yml"]).not.toContain("old-pkg");
		expect(written["codecov.yml"]).not.toContain("AUTO-GENERATED");
	});
});

describe("setup: skills step", () => {
	let tmpDir: string;
	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-setup-skills-"));
	});
	afterEach(async () => {
		await rm(tmpDir, { recursive: true });
	});

	it("runs the skills step when agent and skills are configured", async () => {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", agent: "claude", skills: ["git-safety"], providers: {} }),
			filepath: join(tmpDir, "holocron.config.json"),
		};
		// No plugins — skills step is purely local, no provider needed
		const loader = makeLoaderWith(loaded, {});

		const report = await runSetup({
			loaded,
			context: { repoRoot: tmpDir },
			loader,
			print: () => {},
		});

		const skillsStep = report.steps.find((s) => s.capability === "skills");
		// Step runs — may fail if @theholocron/skills is not installed, but the path is exercised
		expect(skillsStep).toBeDefined();
		expect(skillsStep?.step).toBe("install skills");
	}, 30_000); // May trigger `pnpm add @theholocron/skills` auto-install in CI

	it("skips the skills step when agent or skills is absent", async () => {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: {} }),
			filepath: join(tmpDir, "holocron.config.json"),
		};
		const loader = makeLoaderWith(loaded, {});

		const report = await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		expect(report.steps.find((s) => s.capability === "skills")).toBeUndefined();
	});

	it("detects monorepo=true in syncProperties when pnpm-workspace.yaml exists", async () => {
		await writeFile(join(tmpDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");
		let capturedProps: Record<string, string> = {};
		const source = {
			syncProperties: async (props: Record<string, string>) => {
				capturedProps = props;
				return "synced";
			},
		};
		const loaded = loadedFrom({ name: "demo", providers: { vault: "1password", source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: { list: async () => [] } }),
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source }),
		});

		await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		expect(capturedProps["monorepo"]).toBe("true");
	});

	it("records vault list failure as a fail step when vault.list() throws", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { vault: "1password" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					list: async () => {
						throw new Error("vault unreachable");
					},
				},
			}),
		});

		const report = await runSetup({ loaded, context: { repoRoot: tmpDir }, loader, print: () => {} });

		const step = report.steps.find((s) => s.capability === "vault" && s.step === "list");
		expect(step?.status).toBe("fail");
		expect(step?.message).toBe("vault unreachable");
	});
});

// ── setup: Pages step ─────────────────────────────────────────────────────────

describe("setup: Pages step", () => {
	const PAGES_STEP = "configure GitHub Pages";

	afterEach(() => {
		delete process.env.HOLOCRON_DEPLOY_TOKEN;
	});

	function makePagedLoader(docs: Parameters<typeof resolveConfig>[0]["docs"], configurePages?: () => Promise<void>) {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" }, docs }),
			filepath: "/tmp/test/holocron.config.json",
		};
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: { ...(configurePages ? { configurePages } : {}) },
			}),
		});
		return { loaded, loader };
	}

	it("calls configurePages and records ok when HOLOCRON_DEPLOY_TOKEN is set", async () => {
		process.env.HOLOCRON_DEPLOY_TOKEN = "deploy-pat-xyz";
		const called: unknown[] = [];
		const { loaded, loader } = makePagedLoader(
			{ build: "workflow", domain: "docs.theholocron.dev", https: true },
			async (...args) => {
				called.push(args);
			}
		);

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(called).toHaveLength(1);
		expect(called[0]).toEqual([
			{ build: "workflow", domain: "docs.theholocron.dev", https: true },
			"deploy-pat-xyz",
		]);
		const step = report.steps.find((s) => s.step === PAGES_STEP);
		expect(step?.status).toBe("ok");
		expect(step?.message).toContain("workflow");
		expect(step?.message).toContain("docs.theholocron.dev");
	});

	it("includes 'https: enforced' in the result message when https is true", async () => {
		process.env.HOLOCRON_DEPLOY_TOKEN = "deploy-pat";
		const { loaded, loader } = makePagedLoader({ build: "workflow", https: true }, async () => {});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === PAGES_STEP);
		expect(step?.message).toContain("https: enforced");
	});

	it("records a skip step when HOLOCRON_DEPLOY_TOKEN is absent", async () => {
		const called: unknown[] = [];
		const { loaded, loader } = makePagedLoader({ build: "workflow" }, async (...args) => {
			called.push(args);
		});

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			print: () => {},
			keyring: () => null,
		});

		expect(called).toHaveLength(0);
		const step = report.steps.find((s) => s.step === PAGES_STEP);
		expect(step?.status).toBe("skip");
		expect(step?.message).toContain("HOLOCRON_DEPLOY_TOKEN");
	});

	it("re-throws non-AuthError exceptions from deploy token resolution", async () => {
		const boom = new Error("keyring exploded");
		const { loaded, loader } = makePagedLoader({ build: "workflow" }, async () => {});

		await expect(
			runSetup({
				loaded,
				context: { repoRoot: "/tmp/test" },
				loader,
				print: () => {},
				keyring: () => {
					throw boom;
				},
			})
		).rejects.toThrow("keyring exploded");
	});

	it("does not add a Pages step when docs is absent from config", async () => {
		process.env.HOLOCRON_DEPLOY_TOKEN = "deploy-pat";
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: "/tmp/test/holocron.config.json",
		};
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
		});

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(report.steps.find((s) => s.step === PAGES_STEP)).toBeUndefined();
	});

	it("does not add a Pages step when token is set but source has no configurePages", async () => {
		process.env.HOLOCRON_DEPLOY_TOKEN = "deploy-pat";
		const { loaded, loader } = makePagedLoader({ build: "workflow" });

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(report.steps.find((s) => s.step === PAGES_STEP)).toBeUndefined();
	});

	it("omits 'https: enforced' from the result message when https is not set", async () => {
		process.env.HOLOCRON_DEPLOY_TOKEN = "deploy-pat";
		const { loaded, loader } = makePagedLoader(
			{ build: "workflow", domain: "docs.theholocron.dev" },
			async () => {}
		);

		const report = await runSetup({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === PAGES_STEP);
		expect(step?.status).toBe("ok");
		expect(step?.message).not.toContain("https: enforced");
	});
});
