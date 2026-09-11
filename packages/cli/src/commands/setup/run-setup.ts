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

import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createAstromech, extractPreviewConfig, KNOWN_WORKFLOWS } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";

import { AuthError, createFeatureResolver } from "../../auth/auth-resolver.js";
import type {
	Auth,
	Deployment,
	Dns,
	Environments,
	Errors,
	Logs,
	Secrets,
	Source,
	Tooling,
	Vault,
	Wiki,
	Workers,
} from "../../plugin/capabilities.js";
import { PluginLoader } from "../../plugin/loader.js";
import { assertPluginsResolvable } from "../../plugin/workspace.js";
import sentimentBotConfig from "../../templates/config.yml";
import {
	createIgnoreConfig as createAlexignore,
	createRcConfig as createAlexrc,
} from "../../templates/configs/alexjs/index.js";
import {
	createConfig as createCodecov,
	mergeCodecovComponents,
	readWorkspacePackages,
} from "../../templates/configs/codecov/index.js";
import { createConfig as createDevmoji } from "../../templates/configs/devmoji/index.js";
import { createConfig as createEditorconfig } from "../../templates/configs/editorconfig/index.js";
import { createConfig as createEditorconfigChecker } from "../../templates/configs/editorconfig-checker/index.js";
import { createConfig as createPrePush } from "../../templates/configs/pre-push/index.js";
import { createConfig as createPrepareCommitMsg } from "../../templates/configs/prepare-commit-msg/index.js";
import dcoConfig from "../../templates/dco.yml";
import dependabotConfig from "../../templates/dependabot.yml";
import labelerConfig from "../../templates/labeler.yml";
import { withSpinner } from "../../ui/progress.js";
import { style } from "../../ui/style.js";
import { createHeader } from "../../utils/create-header.js";
import { installAgentPrompts } from "./agent-prompts.js";
import { upsertBranchProtection } from "./branch-protection.js";
import { installEngineeringStructure } from "./engineering.js";
import { CANONICAL_LABELS, STALE_LABELS } from "./labels.js";
import { BALANCED_REPO_SETTINGS } from "./repo-settings.js";
import type { RunSetupInput, SetupReport, SetupStepResult } from "./run-step.js";
import { formatStep, runStep } from "./run-step.js";
import { AGENT_SYMLINK_PATHS, installSkills } from "./skills.js";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/commands/setup/run-setup.ts",
	tool: "holocron setup",
});

export async function runSetup(input: RunSetupInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await withSpinner("Loading plugins…", () => loader.load());
	assertPluginsResolvable(loader, "setup");

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const steps: SetupStepResult[] = [];
	const repo = config.repo;
	const effectivePreset = repo?.protection;

	// Git hooks: `--hooks`/`--no-hooks` wins, then `config.hooks`, then default
	// on for `protection: "strict"`.
	const hooksEnabled =
		input.hooks ??
		(typeof config.hooks === "boolean"
			? config.hooks
			: typeof config.hooks === "object"
				? config.hooks.prePush !== false
				: effectivePreset === "strict");

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

		const usesAdvancedCodeQL = (config.tasks ?? [])
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

			const tasksConfig: TasksConfig = { tasks: config.tasks as TasksConfig["tasks"] };
			if (config.extraRequiredChecks) tasksConfig.extraRequiredChecks = config.extraRequiredChecks;
			const requiredChecks =
				effectivePreset === "strict"
					? ["DCO", ...createAstromech({ cwd: input.context.repoRoot, config: tasksConfig }).requiredChecks()]
					: [];
			steps.push(await upsertBranchProtection(source, dryRun, requiredChecks));
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── source: workflow thin wrappers ──────────────────────────────────
	const tasks = config.tasks;
	if (loader.has("source") && tasks && tasks.length > 0) {
		const source = loader.get("source") as Source;
		print(style.step("workflows"));

		// astromech renders every thin caller from the manifest (lint linter set,
		// deploy paths, deploy+preview) and validates it — a bad manifest throws
		// here, aborting setup, same as before. Iterate the manifest (not the map)
		// so step reporting keeps the config's order.
		const files = createAstromech({
			cwd: input.context.repoRoot,
			config: { tasks: tasks as TasksConfig["tasks"] },
			orgContext: { org: config.org, domain: config.domain },
		}).thinCallers();

		for (const entry of tasks) {
			const name = typeof entry === "string" ? entry : entry.name;

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

			const filename = name === "deploy" ? "deploy.yml" : `${name}.yml`;
			const content = files.get(filename);
			if (content === undefined) continue; // ci: false — nothing to write

			const withPreview = name === "deploy" && content.includes("workflows/preview.yml@main");
			const step = withPreview ? "write workflow deploy (with preview)" : `write workflow ${name}`;
			steps.push(
				await runStep("source", step, dryRun, async () => {
					await source.writeWorkflowFile(filename, `${workflowHeader()}${content}`);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── source: labeler config ───────────────────────────────────────────
	if (
		loader.has("source") &&
		(config.tasks ?? []).map((e) => (typeof e === "string" ? e : e.name)).includes("bookkeeping")
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
		if (hooksEnabled) {
			steps.push(
				await runStep("source", "write .husky/pre-push", dryRun, async () => {
					await source.writeRepoFile(".husky/pre-push", createPrePush(config.holocronScript));
					return "runs `holocron ci` before push — bypass with `git push --no-verify`";
				})
			);
			print(formatStep(steps[steps.length - 1]!));
			if (config.syncScripts !== false) {
				steps.push(
					await runStep("source", "set package.json prepare script", dryRun, async () => {
						return (await ensurePrepareScript(input.context.repoRoot))
							? "prepare now runs husky"
							: "already runs husky";
					})
				);
				print(formatStep(steps[steps.length - 1]!));
			}
		} else {
			steps.push({
				capability: "source",
				step: "write .husky/pre-push",
				status: "skip",
				message: "git hooks disabled",
			});
			print(formatStep(steps[steps.length - 1]!));
		}
		{
			const configuredWorkflowNames = (config.tasks ?? []).map((e) => (typeof e === "string" ? e : e.name));
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

		const deployEntry = (config.tasks ?? [])
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

	// ── errors: provision the tracker project + push the DSN to secrets ─
	if (loader.has("errors")) {
		const errors = loader.get("errors") as Errors;
		print(style.step("errors"));

		if (errors.ensureProject) {
			let dsn: string | undefined;
			steps.push(
				await runStep("errors", `ensureProject ${config.name}`, dryRun, async () => {
					const result = await errors.ensureProject!({ name: config.name });
					dsn = result.dsn;
					return `project ${result.alreadyExists ? "exists" : "created"}`;
				})
			);
			print(formatStep(steps[steps.length - 1]!));

			if (dsn && loader.has("secrets")) {
				const secrets = loader.get("secrets") as Secrets;
				const { envKeys } = await errors.describe();
				for (const key of envKeys) {
					steps.push(
						await runStep("errors", `secrets set ${key}`, dryRun, async () => {
							await secrets.setSecret({ kind: "repo" }, key, dsn!);
						})
					);
					print(formatStep(steps[steps.length - 1]!));
				}
			}
		}
	}

	// ── logs: provision the aggregation datasets ───────────────────────
	if (loader.has("logs")) {
		const logs = loader.get("logs") as Logs;
		print(style.step("logs"));

		if (logs.ensureDataset) {
			for (const dataset of ["holocron-ci", "holocron-local"]) {
				steps.push(
					await runStep("logs", `ensureDataset ${dataset}`, dryRun, async () => {
						const result = await logs.ensureDataset!(dataset);
						return `${dataset} ${result.alreadyExists ? "exists" : "created"}`;
					})
				);
				print(formatStep(steps[steps.length - 1]!));
			}
		}
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

/**
 * Ensure `package.json#scripts.prepare` runs `husky` so git hooks register on
 * install. Merge-only: an existing `prepare` that does more than husky (e.g.
 * `turbo run build` — needed where root config files import a workspace
 * package's `dist/`, theholocron/holocron#654) is preserved and husky is
 * appended. Leaves every other script untouched. Returns `true` when it wrote
 * a change, `false` when already runs husky or there is no `package.json`.
 */
async function ensurePrepareScript(repoRoot: string): Promise<boolean> {
	const pkgPath = join(repoRoot, "package.json");
	let content: string;
	try {
		content = await readFile(pkgPath, "utf8");
	} catch {
		return false;
	}
	const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
	const scripts = pkg.scripts ?? {};
	const current = scripts.prepare?.trim() ?? "";
	// Already invokes husky (bare, or as a step in a chain) → nothing to do.
	if (/(^|[\s&|;])husky($|[\s&|;])/.test(current)) return false;
	scripts.prepare = current ? `${current} && husky` : "husky";
	pkg.scripts = scripts;
	await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
	return true;
}
