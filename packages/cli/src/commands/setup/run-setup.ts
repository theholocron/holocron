/**
 * `holocron setup` — orchestrates per-capability setup actions across
 * every plugin loaded from `holocron.config.json`.
 *
 * Per CLAUDE.md soft-skip: each step is wrapped in a try/catch and
 * failures don't abort subsequent capabilities. The summary at the end
 * reports counts so the operator can see what worked + what didn't.
 *
 * Per the Standards: when `ctx.dryRun` is true, mutating calls are
 * replaced with "would" log lines. Read-only probes (e.g.,
 * `vault.list`) still run so the operator sees real state.
 *
 * The orchestrator knows about specific capability methods by name
 * (e.g., `source.enableVulnerabilityAlerts`). This deliberate coupling
 * makes the "what does setup do" contract explicit and concrete —
 * decoupling via a per-capability `setupSteps()` method would be more
 * extensible but pushes the same knowledge into N plugins instead of
 * one central place.
 */

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { AuthError, createFeatureResolver } from "../../auth/auth-resolver.js";
import type {
	Auth,
	Deployment,
	Dns,
	Environments,
	Source,
	Tooling,
	Vault,
	Wiki,
	Workers,
} from "../../plugin/capabilities.js";
import { ConfigError } from "../../config/config.js";
import { PluginLoader } from "../../plugin/loader.js";
import { withSpinner } from "../../ui/progress.js";
import { style } from "../../ui/style.js";
import { createHeader } from "../../utils/create-header.js";
import {
	deriveDeployPaths,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	WORKFLOW_CHECK_CONTEXTS,
} from "../setup-workflows/index.js";
import dependabotConfig from "../../templates/dependabot.yml";
import dcoConfig from "../../templates/dco.yml";

const { workflowHeader, scaffoldHeader } = createHeader({
	source: "packages/cli/src/commands/setup/run-setup.ts",
	tool: "holocron setup",
});

import { installAgentPrompts } from "./agent-prompts.js";
import { upsertBranchProtection } from "./branch-protection.js";
import { installEngineeringStructure } from "./engineering.js";
import { CANONICAL_LABELS, STALE_LABELS } from "./labels.js";
import { BALANCED_REPO_SETTINGS } from "./repo-settings.js";
import { formatStep, runStep } from "./run-step.js";
import type { RunSetupInput, SetupReport, SetupStepResult } from "./run-step.js";
import { AGENT_SYMLINK_PATHS, installSkills } from "./skills.js";
import { createRcConfig as createAlexrc, createIgnoreConfig as createAlexignore } from "../../templates/configs/alexjs/index.js";
import { createConfig as createCodecov, mergeCodecovComponents, readWorkspacePackages } from "../../templates/configs/codecov/index.js";
import { createConfig as createDevmoji } from "../../templates/configs/devmoji/index.js";
import { createConfig as createEditorconfig } from "../../templates/configs/editorconfig/index.js";
import { createConfig as createEditorconfigChecker } from "../../templates/configs/editorconfig-checker/index.js";
import { createConfig as createPrepareCommitMsg } from "../../templates/configs/prepare-commit-msg/index.js";
import labelerConfig from "../../templates/labeler.yml";
import sentimentBotConfig from "../../templates/config.yml";

export async function runSetup(input: RunSetupInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await withSpinner("Loading plugins…", () => loader.load());

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const steps: SetupStepResult[] = [];
	const repo = config.repo;
	const effectivePreset = repo?.protection;

	print(style.header(`Holocron setup — ${config.name}${dryRun ? " (dry-run)" : ""}`));
	print(style.dim(`  config: ${input.loaded.filepath}`));
	print("");

	// ── source: security toggles + repo policy ──────────────────────────
	if (loader.has("source")) {
		const source = loader.get("source") as Source;
		print(style.step("source"));
		const SECURITY_SKIP_CODES: Partial<Record<string, number[]>> = {
			enableSecretScanning: [422],
			enablePrivateVulnerabilityReporting: [404],
		};
		for (const method of [
			"enableVulnerabilityAlerts",
			"enableAutomatedSecurityFixes",
			"enableSecretScanning",
			"enablePrivateVulnerabilityReporting",
			"enableDependencyGraph",
		] as const) {
			steps.push(
				await runStep(
					"source",
					method,
					dryRun,
					async () => {
						await source[method]();
					},
					{ skipCodes: SECURITY_SKIP_CODES[method] }
				)
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		const usesAdvancedCodeQL = (config.workflows ?? [])
			.map((e) => (typeof e === "string" ? e : e.name))
			.includes("codeql");
		steps.push(
			await runStep(
				"source",
				usesAdvancedCodeQL ? "disableDefaultCodeScanning" : "enableCodeScanning",
				dryRun,
				async () => {
					if (usesAdvancedCodeQL) {
						await source.disableDefaultCodeScanning();
					} else {
						return await source.enableCodeScanning();
					}
				}
			)
		);
		print(formatStep(steps[steps.length - 1]!));

		if (effectivePreset && effectivePreset !== "none") {
			steps.push(
				await runStep("source", "updateRepoSettings", dryRun, async () => {
					await source.updateRepoSettings(BALANCED_REPO_SETTINGS);
				})
			);
			print(formatStep(steps[steps.length - 1]!));

			const configuredWorkflowNames = [
				...new Set((config.workflows ?? []).map((entry) => (typeof entry === "string" ? entry : entry.name))),
			];
			const requiredChecks =
				effectivePreset === "strict"
					? [
							"DCO",
							...configuredWorkflowNames.flatMap((name) => {
								const ctx = WORKFLOW_CHECK_CONTEXTS[name];
								return ctx ? [ctx] : [];
							}),
							...(repo?.requiredChecks ?? []),
						]
					: [];
			steps.push(await upsertBranchProtection(source, dryRun, requiredChecks));
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── source: workflow thin wrappers ──────────────────────────────────
	const workflows = config.workflows;
	if (loader.has("source") && workflows && workflows.length > 0) {
		const source = loader.get("source") as Source;
		print(style.step("workflows"));
		for (const entry of workflows) {
			const name = typeof entry === "string" ? entry : entry.name;
			const rawWith = typeof entry === "object" ? entry.with : undefined;
			const withOverrides = rawWith ? normalizeWorkflowWith(rawWith) : undefined;
			const explicitPaths = typeof entry === "object" ? entry.paths : undefined;
			const additionalPaths =
				explicitPaths ??
				(name === "deploy" && rawWith ? deriveDeployPaths(rawWith as Record<string, unknown>) : undefined);

			if (name === "test" && withOverrides) {
				const runUnit = withOverrides["run-unit"];
				const runStorybook = withOverrides["run-storybook"];
				const unitDisabled = runUnit === false;
				const storybookDisabled = runStorybook === false;
				const neitherEnabled = unitDisabled && storybookDisabled;
				if (neitherEnabled) {
					throw new ConfigError(
						'test workflow: at least one of "run-unit" or "run-storybook" must be true. ' +
							"Library repos use run-unit: true; UI/Storybook repos use run-storybook: true."
					);
				}
			}

			if (!KNOWN_WORKFLOWS.has(name)) {
				steps.push({
					capability: "source",
					step: `write workflow ${name}`,
					status: "skip",
					message: `unknown workflow "${name}" — no template available`,
				});
				print(formatStep(steps[steps.length - 1]!));
				continue;
			}

			if (name === "deploy" && rawWith) {
				const previewCfg = extractPreviewConfig(rawWith as Record<string, unknown>, {
					org: config.org,
					domain: config.domain,
				});
				if (previewCfg) {
					const paths = additionalPaths!;
					steps.push(
						await runStep("source", "write workflow deploy (with preview)", dryRun, async () => {
							await source.writeWorkflowFile(
								"deploy.yml",
								`${workflowHeader()}${generateCombinedDeployContent(withOverrides!, paths, previewCfg)}`
							);
						})
					);
					print(formatStep(steps[steps.length - 1]!));
					continue;
				}
			}

			steps.push(
				await runStep("source", `write workflow ${name}`, dryRun, async () => {
					await source.writeWorkflowFile(
						`${name}.yml`,
						`${workflowHeader()}${generateThinCallerContent(name, withOverrides, additionalPaths)}`
					);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── source: labeler config ───────────────────────────────────────────
	if (
		loader.has("source") &&
		(config.workflows ?? []).map((e) => (typeof e === "string" ? e : e.name)).includes("bookkeeping")
	) {
		const source = loader.get("source") as Source;
		steps.push(
			await runStep("source", "write .github/labeler.yml", dryRun, async () => {
				await source.writeRepoFile(".github/labeler.yml", `${workflowHeader()}${labelerConfig}`);
			})
		);
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── source: dependabot + dco config ─────────────────────────────────
	if (loader.has("source") && effectivePreset !== "none") {
		const source = loader.get("source") as Source;
		steps.push(
			await runStep("source", "write .github/dependabot.yml", dryRun, async () => {
				await source.writeRepoFile(".github/dependabot.yml", `${workflowHeader()}${dependabotConfig}`);
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .github/dco.yml", dryRun, async () => {
				await source.writeRepoFile(".github/dco.yml", `${workflowHeader()}${dcoConfig}`);
			})
		);
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── source: static config files ──────────────────────────────────────
	if (loader.has("source")) {
		const source = loader.get("source") as Source;
		steps.push(
			await runStep("source", "write .github/config.yml", dryRun, async () => {
				await source.writeRepoFile(".github/config.yml", `${workflowHeader()}${sentimentBotConfig}`);
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .alexrc.json", dryRun, async () => {
				await source.writeRepoFile(".alexrc.json", createAlexrc());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .alexignore", dryRun, async () => {
				await source.writeRepoFile(".alexignore", createAlexignore());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .editorconfig", dryRun, async () => {
				await source.writeRepoFile(".editorconfig", createEditorconfig());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .editorconfig-checker.json", dryRun, async () => {
				await source.writeRepoFile(".editorconfig-checker.json", createEditorconfigChecker());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write devmoji.config.cjs", dryRun, async () => {
				await source.writeRepoFile("devmoji.config.cjs", createDevmoji());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .husky/prepare-commit-msg", dryRun, async () => {
				await source.writeRepoFile(".husky/prepare-commit-msg", createPrepareCommitMsg());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		{
			const configuredWorkflowNames = (config.workflows ?? []).map((e) => (typeof e === "string" ? e : e.name));
			const hasTestWorkflow = configuredWorkflowNames.includes("test");
			const packages = await readWorkspacePackages(input.context.repoRoot);
			const existing = await readFile(join(input.context.repoRoot, "codecov.yml"), "utf8").catch(() => null);
			if (!hasTestWorkflow && existing == null) {
				steps.push({
					capability: "source",
					step: "write codecov.yml",
					status: "skip",
					message: "no test workflow configured",
				});
			} else {
				steps.push(
					await runStep("source", "write codecov.yml", dryRun, async () => {
						const content =
							existing != null ? mergeCodecovComponents(existing, packages) : createCodecov(packages);
						await source.writeRepoFile("codecov.yml", content);
						return packages.length > 0 ? `${packages.length} components` : "no components";
					})
				);
			}
			print(formatStep(steps[steps.length - 1]!));
		}

		if (source.syncLabels) {
			steps.push(
				await runStep("source", "sync labels", dryRun, async () => {
					return source.syncLabels!(CANONICAL_LABELS, STALE_LABELS);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		const properties: Record<string, string> = {};

		if (effectivePreset && effectivePreset !== "none") properties["branch_protection_level"] = effectivePreset;

		const isMonorepo = await access(join(input.context.repoRoot, "pnpm-workspace.yaml"))
			.then(() => true)
			.catch(() => false);
		properties["monorepo"] = String(isMonorepo);

		const manual = repo?.properties ?? {};
		if (manual.lifecycle) properties["lifecycle"] = manual.lifecycle;
		if (manual.open_source !== undefined) properties["open_source"] = String(manual.open_source);
		if (manual.runtime_environment) properties["runtime_environment"] = manual.runtime_environment;
		if (manual.uses_external_packages !== undefined)
			properties["uses_external_packages"] = String(manual.uses_external_packages);

		if (source.syncProperties) {
			steps.push(await runStep("source", "sync properties", dryRun, () => source.syncProperties!(properties)));
			print(formatStep(steps[steps.length - 1]!));
		}

		const topics = repo?.topics ?? [];
		if (topics.length > 0 && source.syncTopics) {
			steps.push(await runStep("source", "sync topics", dryRun, () => source.syncTopics!(topics)));
			print(formatStep(steps[steps.length - 1]!));
		}

		if (config.description && source.syncDescription) {
			steps.push(
				await runStep("source", "sync description", dryRun, () => source.syncDescription!(config.description!))
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (config.homepage && source.syncHomepage) {
			steps.push(await runStep("source", "sync homepage", dryRun, () => source.syncHomepage!(config.homepage!)));
			print(formatStep(steps[steps.length - 1]!));
		}

		const teams = repo?.teams ?? [];
		if (teams.length > 0) {
			if (source.syncTeams) {
				steps.push(
					await runStep("source", "sync teams", dryRun, () => source.syncTeams!(teams), { skipCodes: [422] })
				);
				print(formatStep(steps[steps.length - 1]!));

				const repoCoord = input.context.repo ?? repo?.name ?? "";
				const org = repoCoord.includes("/") ? repoCoord.split("/")[0]! : "";
				const writeableTeams = teams
					.map((t) => (typeof t === "string" ? { slug: t, permission: "push" as const } : t))
					.filter((t) => ["push", "maintain", "admin"].includes(t.permission));
				if (org && writeableTeams.length > 0) {
					steps.push(
						await runStep("source", "write .github/CODEOWNERS", dryRun, async () => {
							const content = writeableTeams.map((t) => `* @${org}/${t.slug}`).join("\n") + "\n";
							await source.writeRepoFile(".github/CODEOWNERS", content);
						})
					);
					print(formatStep(steps[steps.length - 1]!));
				}
			} else {
				steps.push({
					capability: "source",
					step: "sync teams",
					status: "skip",
					message: "provider does not implement syncTeams",
				});
				print(formatStep(steps[steps.length - 1]!));
			}
		}
	}

	// ── environments ────────────────────────────────────────────────────
	if (loader.has("environments")) {
		const envs = loader.get("environments") as Environments;
		print(style.step("environments"));
		for (const envName of ["staging", "production"]) {
			steps.push(
				await runStep("environments", `upsert ${envName}`, dryRun, async () => {
					await envs.upsertEnvironment({ name: envName });
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── docs: configure GitHub Pages ────────────────────────────────────
	if (loader.has("source") && config.docs) {
		const source = loader.get("source") as Source;
		const resolveDeployToken = createFeatureResolver({
			envName: "HOLOCRON_DEPLOY_TOKEN",
			keyringKey: "github.deploy",
		});
		let deployToken: string | undefined;
		try {
			deployToken = resolveDeployToken({ keyring: input.keyring });
		} catch (err) {
			if (!(err instanceof AuthError)) throw err;
		}
		print(style.step("docs"));
		if (!deployToken) {
			steps.push({
				capability: "source",
				step: "configure GitHub Pages",
				status: "skip",
				message:
					"no deploy token found — set HOLOCRON_DEPLOY_TOKEN or run: holocron auth set github.deploy <PAT>",
			});
			print(formatStep(steps[steps.length - 1]!));
		} else if (source.configurePages) {
			steps.push(
				await runStep("source", "configure GitHub Pages", dryRun, async () => {
					await source.configurePages!(config.docs!, deployToken);
					const parts: string[] = [config.docs!.build];
					if (config.docs!.domain) parts.push(`domain: ${config.docs!.domain}`);
					if (config.docs!.https) parts.push("https: enforced");
					return parts.join(", ");
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── wiki: provision engineering wiki config ──────────────────────────
	if (loader.has("wiki")) {
		const wiki = loader.get("wiki") as Wiki;
		print(style.step("wiki"));
		steps.push(
			await runStep("wiki", "provision wiki config", dryRun, async () => {
				return await wiki.provision({ name: config.name });
			})
		);
		print(formatStep(steps[steps.length - 1]!));

		const wikiDns = wiki.dnsRecord?.();
		const wikiProxy = wiki.proxyConfig?.();
		if (wikiDns && loader.has("dns")) {
			const dns = loader.get("dns") as Dns;
			steps.push(
				await runStep("dns", `upsertRecord ${wikiDns.cname}`, dryRun, async () => {
					await dns.upsertRecord(wikiDns.zone, {
						type: "CNAME",
						name: wikiDns.cname,
						content: wikiDns.target,
						ttl: 1,
						...(wikiProxy ? { proxied: true } : {}),
					});
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (wikiProxy && wikiDns && loader.has("workers")) {
			const workers = loader.get("workers") as Workers;
			steps.push(
				await runStep("workers", `upsertProxy ${wikiDns.cname}`, dryRun, async () => {
					await workers.upsertProxy(wikiDns.cname, wikiProxy);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── deployment: ensure project + preview infrastructure ─────────────
	if (loader.has("deployment")) {
		const deploy = loader.get("deployment") as Deployment;
		print(style.step("deployment"));

		const deployEntry = (config.workflows ?? [])
			.map((e) => (typeof e === "string" ? { name: e } : e))
			.find((e) => e.name === "deploy");
		const previewCfg = deployEntry?.with
			? extractPreviewConfig(deployEntry.with as Record<string, unknown>, {
					org: config.org,
					domain: config.domain,
				})
			: null;

		if (!previewCfg) {
			steps.push(
				await runStep("deployment", `ensureProject ${config.name}`, dryRun, async () => {
					await deploy.ensureProject({ name: config.name });
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (previewCfg) {
			steps.push(
				await runStep("deployment", `ensureProject ${previewCfg.project}`, dryRun, async () => {
					await deploy.ensureProject({ name: previewCfg.project });
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (previewCfg?.domain && deploy.ensureCustomDomain) {
			steps.push(
				await runStep("deployment", `ensureCustomDomain ${previewCfg.domain}`, dryRun, async () => {
					await deploy.ensureCustomDomain!(previewCfg.project, previewCfg.domain!);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (previewCfg?.domain && loader.has("dns")) {
			const dns = loader.get("dns") as Dns;
			const wildcardDomain = `*.${previewCfg.domain}`;
			steps.push(
				await runStep("dns", `upsertRecord ${previewCfg.domain}`, dryRun, async () => {
					await dns.upsertRecord(previewCfg.domain!, {
						type: "CNAME",
						name: previewCfg.domain!,
						content: `${previewCfg.project}.pages.dev`,
						ttl: 1,
					});
				})
			);
			print(formatStep(steps[steps.length - 1]!));
			steps.push(
				await runStep("dns", `upsertRecord ${wildcardDomain}`, dryRun, async () => {
					await dns.upsertRecord(previewCfg.domain!, {
						type: "CNAME",
						name: wildcardDomain,
						content: `${previewCfg.project}.pages.dev`,
						ttl: 1,
					});
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── auth: ensure webhook app (optional method) ──────────────────────
	if (loader.has("auth")) {
		const auth = loader.get("auth") as Auth;
		print(style.step("auth"));
		if (auth.ensureWebhookApp) {
			steps.push(
				await runStep("auth", "ensureWebhookApp", dryRun, async () => {
					const result = await auth.ensureWebhookApp!();
					return `webhook ${result.alreadyExists ? "exists" : "created"}`;
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		} else {
			steps.push({
				capability: "auth",
				step: "ensureWebhookApp",
				status: "skip",
				message: "provider does not implement ensureWebhookApp",
			});
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── vault: bootstrap project + configs, then read-only probe ───────
	if (loader.has("vault")) {
		const vault = loader.get("vault") as Vault;
		print(style.step("vault"));

		if (vault.ensureProject) {
			steps.push(
				await runStep("vault", `ensureProject ${config.name}`, dryRun, async () => {
					const result = await vault.ensureProject!(config.name);
					return `project ${result.alreadyExists ? "exists" : "created"}`;
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (vault.ensureEnvironment) {
			for (const envName of ["dev", "stg", "prd"]) {
				steps.push(
					await runStep("vault", `ensureEnvironment ${envName}`, dryRun, async () => {
						const result = await vault.ensureEnvironment!(config.name, envName);
						return `${envName} ${result.alreadyExists ? "exists" : "created"}`;
					})
				);
				print(formatStep(steps[steps.length - 1]!));
			}
		}

		try {
			const keys = await vault.list();
			steps.push({
				capability: "vault",
				step: "list",
				status: "ok",
				message: `${keys.length} keys available`,
			});
		} catch (err) {
			steps.push({
				capability: "vault",
				step: "list",
				status: "fail",
				message: err instanceof Error ? err.message : String(err),
			});
		}
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── tooling: sync each (many cardinality) ───────────────────────────
	if (loader.has("tooling")) {
		const tools = loader.get("tooling") as Tooling[];
		print(style.step("tooling"));
		for (const tool of tools) {
			steps.push(
				await runStep("tooling", `${tool.providerName}.sync`, dryRun, async () => {
					await tool.sync();
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── skills: install agent skills from registry ──────────────────────
	if (config.skills && config.skills.length > 0 && config.agent) {
		print(style.step("skills"));
		if (!(config.agent in AGENT_SYMLINK_PATHS)) {
			steps.push({
				capability: "skills",
				step: "install skills",
				status: "skip",
				message: `agent "${config.agent}" has no known skill install path`,
			});
		} else {
			steps.push(
				await runStep("skills", "install skills", dryRun, async () => {
					return await installSkills({
						agent: config.agent!,
						skills: config.skills!,
						repoRoot: input.context.repoRoot,
					});
				})
			);
		}
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── prompts: write agent role prompts to .agents/prompts/ ────────────
	if (config.agent) {
		print(style.step("prompts"));
		steps.push(
			await runStep("prompts", "install agent prompts", dryRun, async () => {
				return await installAgentPrompts({ repoRoot: input.context.repoRoot });
			})
		);
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── engineering: provision docs/decisions/ and docs/engineering/ ─────
	if (config.docs) {
		print(style.step("engineering"));
		steps.push(
			await runStep("engineering", "provision engineering structure", dryRun, async () => {
				return await installEngineeringStructure({ repoRoot: input.context.repoRoot });
			})
		);
		print(formatStep(steps[steps.length - 1]!));
	}

	const summary = steps.reduce(
		(acc, s) => {
			if (s.status === "ok") acc.ok += 1;
			else if (s.status === "fail") acc.fail += 1;
			else if (s.status === "skip") acc.skip += 1;
			else if (s.status === "dry-run") acc.dryRun += 1;
			return acc;
		},
		{ ok: 0, fail: 0, skip: 0, dryRun: 0 }
	);

	print("");
	const summaryLine = `  ${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped${
		dryRun ? `, ${summary.dryRun} would-do` : ""
	}`;
	print(summary.fail > 0 ? style.fail(summaryLine.trim()) : style.success(summaryLine.trim()));

	const skippedSteps = steps.filter((s) => s.status === "skip");
	if (skippedSteps.length > 0) {
		print("");
		print(style.hint("  Skipped:"));
		for (const s of skippedSteps) {
			/* v8 ignore next -- all skip steps set message; empty fallback is defensive */
			print(style.hint(`    · ${s.step}${s.message ? `  (${s.message})` : ""}`));
		}
	}

	if (steps.some((s) => s.reason === "permissions")) {
		print("");
		print(style.warn("Some steps failed with 403 (insufficient token permissions)."));
		print(style.hint("     Repo-scoped operations (rulesets, settings, workflows) require a"));
		print(style.hint("     fine-grained PAT passed via --token or HOLOCRON_ADMIN_TOKEN:"));
		print("");
		print(style.hint("       · Administration          — read and write"));
		print(style.hint("       · Code scanning alerts    — read and write"));
		print(style.hint("       · Contents                — read and write"));
		print(style.hint("       · Secret scanning alerts  — read and write"));
		print(style.hint("       · Workflows               — read and write"));
		print(style.hint("       · Metadata                — read (added automatically)"));
		print("");
		print(style.hint("     Org-scoped operations (teams, custom properties) require"));
		print(style.hint("     HOLOCRON_ORG_TOKEN — a fine-grained PAT with resource owner set to the org:"));
		print("");
		print(style.hint("       · Administration          — read and write (repository permission)"));
		print(style.hint("       · Members                 — read (organization permission)"));
		print(style.hint("       · Organization custom properties — read and write (organization permission)"));
		print(style.hint("       · Metadata                — read (repository permission, auto-included)"));
		print("");
		print(style.hint("     Create tokens at: https://github.com/settings/personal-access-tokens/new"));
		print(style.hint("     Then re-run:      holocron setup --token <your-admin-pat>"));
		print(style.hint("     Store org token:  HOLOCRON_ORG_TOKEN env var or keyring key github.org"));
	}

	return { steps, summary };
}
