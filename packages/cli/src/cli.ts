import { readFileSync } from "node:fs";
import { join } from "node:path";

import { input, select } from "@inquirer/prompts";
import { createAstromech } from "@theholocron/astromech";
import { loadTasksConfig } from "@theholocron/astromech/config";
import type { LogLevel } from "@theholocron/observability/core";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { AuthError, createFeatureResolver } from "./auth/auth-resolver.js";
import { type ParsedTokenArgs, parseTokenArgs, TokenParseError } from "./auth/token-args.js";
import { runAuthCheck, runAuthList, runAuthSet, runAuthUnset } from "./commands/auth.js";
import { runCleanupPreview } from "./commands/cleanup-preview.js";
import { runClone } from "./commands/clone.js";
import { commandsInContext } from "./commands/contexts.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { NewError, parseTopics, runNew, validateRepoName } from "./commands/new.js";
import { runNpmBumpVersions } from "./commands/npm-bump-versions.js";
import { PluginCreateError, resolvePluginCreateInputs, runPluginCreate } from "./commands/plugin-create/index.js";
import { runPublish } from "./commands/publish.js";
import { runSecretSet } from "./commands/secret-set.js";
import { runSecretsSync } from "./commands/secrets-sync.js";
import { runSetup } from "./commands/setup/index.js";
import { runSkillsInstall, runSkillsRemove, runSkillsUpdate } from "./commands/skills.js";
import { runSync } from "./commands/sync.js";
import { runSyncGithub } from "./commands/sync-github.js";
import { runSyncReadme } from "./commands/sync-readme.js";
import { runUpgradeDeps } from "./commands/upgrade-deps.js";
import { runUpgradeNode } from "./commands/upgrade-node.js";
import type { TelemetryConfig } from "./config/config.js";
import { loadConfig } from "./config/load-config.js";
import { env } from "./env.js";
import { COMMAND_REGISTRY, getEntry, launchMenu, promptForPositionals } from "./interactive-menu.js";
import { buildCliLogger, type BuildCliLoggerOpts, getLogger, getRunId } from "./logger.js";
import { CARDINALITY } from "./plugin/capabilities.js";
import { applyConfig, captureException, endSession, flush, init, startCommand } from "./telemetry.js";
import { checkForUpdates } from "./update-notifier.js";

const resolveCloneToken = createFeatureResolver({ envName: "HOLOCRON_READ_TOKEN", keyringKey: "github.read" });
const resolveSyncToken = createFeatureResolver({ envName: "HOLOCRON_SYNC_TOKEN", keyringKey: "github.sync" });

/**
 * Error class names whose `.message` is a complete, actionable sentence —
 * the top-level catch prints it and suppresses the stack trace.
 */
const USER_FACING_ERRORS = new Set(["WorkspaceContextError", "ConfigFileError", "NonInteractiveError"]);

const { version: CLI_VERSION } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
	version: string;
};

/** Whether to print the correlation id at command end (`--debug` / `--verbose`). */
let printRunId = false;

/**
 * Resolves the active org in priority order:
 *   1. `--org` CLI flag
 *   2. `HOLOCRON_ORG` env var
 *   3. `org` from `holocron.config.ts`
 */
function resolveOrg(argv: { org?: string }, config: { org?: string }): string | undefined {
	return argv.org ?? env.get("HOLOCRON_ORG") ?? config.org;
}

/**
 * `buildCliLogger` options derived from a loaded `holocron.config` — the
 * level, the Axiom dataset, and the resolved org for a keyring-backed
 * Axiom token. Used by every handler that has already called `loadConfig`.
 */
function cliLoggerOpts(
	argv: { org?: string; verbose?: boolean; quiet?: boolean },
	resolved: { org?: string; log?: { level?: LogLevel; axiom?: { dataset?: string } } }
): BuildCliLoggerOpts {
	return {
		configLevel: resolved.log?.level,
		configAxiomDataset: resolved.log?.axiom?.dataset,
		org: resolveOrg(argv, resolved),
	};
}

/**
 * Fold a loaded `holocron.config` into the running process: reconfigure the
 * logger from `log:`, then apply the `telemetry:` override layer. Every handler
 * that has called `loadConfig` runs this, so a repo's `telemetry.enabled: false`
 * (or `analytics: "none"`) is honoured for that command. Env still wins —
 * `applyConfig` only narrows what `init` already turned on.
 */
function applyResolvedConfig(
	argv: { org?: string; verbose?: boolean; quiet?: boolean },
	resolved: {
		org?: string;
		log?: { level?: LogLevel; axiom?: { dataset?: string } };
		telemetry?: TelemetryConfig;
	}
): void {
	buildCliLogger(argv, cliLoggerOpts(argv, resolved));
	applyConfig(resolved.telemetry);
}

/** Parses --token values and returns the context spread, or null on parse error (exits with code 1). */
function tokenContext(rawTokens: string[] | undefined): ParsedTokenArgs | null {
	if (!rawTokens?.length) return {};
	try {
		return parseTokenArgs(rawTokens);
	} catch (err) {
		if (err instanceof TokenParseError) {
			getLogger().error(`--token: ${err.message}`);
			process.exitCode = 1;
			return null;
		}
		throw err;
	}
}

init(CLI_VERSION);
const updateCheckPromise = checkForUpdates(CLI_VERSION);

let finishCommand: (ok: boolean) => void = () => {};
/** Set by `.fail()` once it has printed an error, so the outer catch doesn't repeat it. */
let errorReported = false;

try {
	await yargs(hideBin(process.argv))
		.scriptName("")
		.usage("holocron <command> [options]")
		// Keep everything after `--` in `argv['--']` instead of folding it into
		// `argv._`. `holocron run <task> [job] -- <args>` forwards `<args>` to the
		// underlying tool (`lhci autorun --config=…`, `turbo run build -- …`); the
		// telemetry command name reads `argv._` and must not pick these up.
		.parserConfiguration({ "populate--": true })
		// ── global options (apply to every subcommand) ──────────────────────
		.option("dry-run", {
			type: "boolean",
			default: false,
			describe:
				"Print what would be mutated without calling capability mutators. " +
				"Commands branch on this; read-only commands ignore it.",
		})
		.option("token", {
			type: "string",
			array: true,
			describe:
				"Vendor token override for plugins. " +
				"Bare form: --token <value> (fallback for all plugins, single-plugin commands). " +
				"Keyed form: --token vendor=value (targets a specific provider; repeat for each). " +
				"Example: --token github=ghp_xxx --token vercel=v_yyy",
		})
		.option("org", {
			type: "string",
			describe:
				"Active org name for namespaced keyring lookup. " +
				"Overrides HOLOCRON_ORG env var and the `org` field in holocron.config.ts. " +
				"Example: --org theholocron",
		})
		.option("cwd", {
			type: "string",
			default: process.cwd(),
			describe: "Directory to search for holocron.config.json",
		})
		.option("verbose", {
			type: "boolean",
			default: false,
			describe: "Set the log level to debug — full structured operational output.",
		})
		.option("debug", {
			type: "boolean",
			default: false,
			describe: "Print the run ID at command end for Axiom lookup. Does not change the log level.",
		})
		.option("quiet", {
			type: "boolean",
			default: false,
			describe: "Set the log level to error — suppress info and warn.",
		})
		.middleware((argv) => {
			const name = (argv._ as string[]).slice(0, 2).join(" ") || "unknown";
			printRunId = Boolean(argv.debug || argv.verbose);
			// Establish the root logger first (command name + flags + env) so its
			// `runId` is available to tag telemetry events. Handlers that load a
			// config call `buildCliLogger(argv, { configLevel })` again to fold in
			// the lowest-priority level + Axiom-dataset sources.
			buildCliLogger(argv, { command: name, org: argv.org });
			finishCommand = startCommand(name);
		})
		// ── commands ────────────────────────────────────────────────────────
		.command(
			"version",
			"Print the CLI version",
			() => {},
			() => {
				console.log(`holocron ${CLI_VERSION}`);
			}
		)
		.command(
			"clone",
			"Clone all repos in a GitHub org as siblings under a single directory",
			(y) =>
				y
					.option("org", {
						type: "string",
						demandOption: true,
						describe: "GitHub org to clone (e.g., theholocron)",
					})
					.option("dir", {
						type: "string",
						describe: "Parent directory to clone into (default: ~/Code/<org>)",
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				let token: string;
				try {
					token = resolveCloneToken({ cliToken: tokens.cliTokens?.["github"] ?? tokens.cliToken });
				} catch (err) {
					getLogger().error(`clone: ${err instanceof AuthError ? err.message : String(err)}`);
					process.exitCode = 1;
					return;
				}
				const report = await runClone({
					org: argv.org,
					token,
					dryRun: argv.dryRun,
					...(argv.dir ? { dir: argv.dir } : {}),
				});
				if (report.status === "fail") process.exitCode = 1;
			}
		)
		.command(
			"doctor",
			"Load the config and run a smoke check against every provider",
			(y) =>
				y.option("repo", {
					type: "string",
					describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
				}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runDoctor({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...(argv.repo ? { repo: argv.repo } : {}),
						...tokens,
						org: resolveOrg(argv, loaded.resolved),
					},
				});
				if (report.summary.fail > 0) {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"setup",
			"Apply infra setup actions across every configured capability",
			(y) =>
				y
					.option("repo", {
						type: "string",
						describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
					})
					.option("hooks", {
						type: "boolean",
						describe:
							"Install git hooks (.husky/pre-push → holocron ci). Default: on for protection:'strict'. --no-hooks to skip.",
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runSetup({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...(argv.repo ? { repo: argv.repo } : {}),
						...tokens,
						org: resolveOrg(argv, loaded.resolved),
					},
					...(argv.hooks !== undefined ? { hooks: argv.hooks as boolean } : {}),
				});
				if (report.summary.fail > 0) {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"skills",
			"Manage agent skills from the @theholocron/skills registry",
			(y) =>
				y
					.command(
						"install",
						"Copy skills from @theholocron/skills into .agents/ with agent symlinks",
						() => {},
						async (argv) => {
							const loaded = await loadConfig(argv.cwd);
							await runSkillsInstall({ loaded, context: { repoRoot: argv.cwd, dryRun: argv.dryRun } });
						}
					)
					.command(
						"remove [names..]",
						"Remove installed skills via npx skills remove",
						(yy) =>
							yy.positional("names", {
								type: "string",
								array: true,
								describe: "Skill name(s) to remove (omit to remove all installed skills)",
							}),
						(argv) => {
							const report = runSkillsRemove({
								context: { repoRoot: argv.cwd, dryRun: argv.dryRun },
								...(argv.names?.length ? { names: argv.names as string[] } : {}),
							});
							if (report.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"update [name]",
						"Update installed skills to their latest upstream versions via npx skills update",
						(yy) =>
							yy.positional("name", {
								type: "string",
								describe: "Skill name to update (omit to update all installed skills)",
							}),
						(argv) => {
							const report = runSkillsUpdate({
								context: { repoRoot: argv.cwd, dryRun: argv.dryRun },
								...(argv.name ? { name: argv.name as string } : {}),
							});
							if (report.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchMenu(
								COMMAND_REGISTRY.filter((e) => e.group === "skills"),
								argv,
								"skills — choose a subcommand:",
								"Run `holocron skills --help` to see available skills subcommands."
							);
						}
					),
			() => {}
		)
		.command(
			"secret set [name] [value]",
			"Set a single secret via the configured `secrets` capability",
			(y) =>
				y
					.positional("name", {
						type: "string",
						describe: "Secret name (e.g., NPM_TOKEN)",
					})
					.positional("value", {
						type: "string",
						describe:
							"Secret value (positional). If omitted, sources from --from-stdin, --from-env, or env var matching <name>.",
					})
					.option("from-stdin", {
						type: "boolean",
						default: false,
						describe: "Read the secret value from stdin",
					})
					.option("from-env", {
						type: "string",
						describe: "Read the secret value from the named env var (otherwise: env var matching <name>)",
					})
					.option("scope", {
						type: "string",
						default: "repo",
						describe: 'Scope: "repo" (default), "env=<name>", or "org=<name>"',
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const [name] = await promptForPositionals(getEntry("secret set"), argv as Record<string, unknown>);
				const scopeArg = argv.scope as string;
				const scope = parseScope(scopeArg);
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runSecretSet({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...tokens,
						org: resolveOrg(argv, loaded.resolved),
					},
					name: name!,
					...(argv.value ? { value: argv.value as string } : {}),
					...(argv.fromStdin ? { fromStdin: true } : {}),
					...(argv.fromEnv ? { fromEnv: argv.fromEnv as string } : {}),
					scope,
				});
				if (report.status === "fail") {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"secrets sync [environmentId]",
			"Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
			(y) =>
				y
					.positional("environmentId", {
						type: "string",
						describe: "Vault environment id to read (1P Environment id, etc.)",
					})
					.option("project-id", {
						type: "string",
						describe: "Deployment project id (e.g., Vercel prj_*). Required when deployment is loaded.",
					})
					.option("target", {
						type: "array",
						default: ["production", "preview"] as Array<"development" | "preview" | "production">,
						describe: "Deployment targets to sync to. Defaults to production + preview.",
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const [environmentId] = await promptForPositionals(
					getEntry("secrets sync"),
					argv as Record<string, unknown>
				);
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runSecretsSync({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...tokens,
						org: resolveOrg(argv, loaded.resolved),
					},
					environmentId: environmentId!,
					...(argv.projectId ? { projectId: argv.projectId } : {}),
					targets: argv.target as Array<"development" | "preview" | "production">,
				});
				if (report.summary.fail > 0) {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"deploy [branch]",
			"Trigger a deployment via the configured `deployment` capability",
			(y) =>
				y
					.positional("branch", {
						type: "string",
						describe: "Git branch to deploy",
					})
					.option("project-id", {
						type: "string",
						demandOption: true,
						describe: "Deployment project id (e.g., Vercel prj_*)",
					})
					.option("target", {
						type: "string",
						choices: ["production", "staging"] as const,
						describe: "Named environment to deploy into. Omit for a branch preview.",
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const [branch] = await promptForPositionals(getEntry("deploy"), argv as Record<string, unknown>);
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runDeploy({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...tokens,
						org: resolveOrg(argv, loaded.resolved),
					},
					projectId: argv.projectId as string,
					branch: branch!,
					...(argv.target ? { target: argv.target as "production" | "staging" } : {}),
				});
				if (report.status === "fail") {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"cleanup-preview [pr]",
			"List and delete Cloudflare Pages preview deployments for a GitHub PR",
			(y) =>
				y
					.positional("pr", {
						type: "number",
						describe: "PR number to clean up",
					})
					.option("project", {
						type: "string",
						demandOption: true,
						describe: "Cloudflare Pages project name (e.g. theholocron-preview)",
					})
					.option("repo", {
						type: "string",
						describe: "GitHub repo as owner/name — defaults to the repo in holocron.config",
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const [pr] = await promptForPositionals(getEntry("cleanup-preview"), argv as Record<string, unknown>);
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runCleanupPreview({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...tokens,
						org: resolveOrg(argv, loaded.resolved),
					},
					prNumber: Number(pr),
					project: argv.project as string,
					...(argv.repo ? { repo: argv.repo as string } : {}),
				});
				if (report.status === "fail") {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"bump-versions [new-version]",
			"Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
			(y) =>
				y.positional("new-version", {
					type: "string",
					describe: "Version to set (e.g., 4.2.0 or 2.0.0-alpha.1)",
				}),
			async (argv) => {
				const [newVersion] = await promptForPositionals(
					getEntry("bump-versions"),
					argv as Record<string, unknown>
				);
				const report = await runNpmBumpVersions({
					version: newVersion!,
					cwd: argv.cwd,
					dryRun: argv.dryRun,
				});
				if (report.status === "fail") {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"publish",
			"Publish @theholocron/* packages to npm",
			(y) =>
				y
					.option("initial", {
						type: "boolean",
						default: false,
						describe:
							"One-shot bootstrap publish for trusted-publishing-eligible packages (npm needs the " +
							"package to exist before Trusted Publishing can be configured for it). Required today — " +
							"a non-initial `publish` isn't implemented yet.",
					})
					.option("tag", {
						type: "string",
						default: "alpha",
						describe: "npm distribution tag (defaults to alpha)",
					})
					.option("otp", {
						type: "string",
						describe: "One-time password from your authenticator (required if npm needs 2FA for writes)",
					}),
			async (argv) => {
				if (!argv.initial) {
					getLogger().error(
						"publish: only `--initial` is supported today. Run `holocron publish --initial`."
					);
					process.exitCode = 1;
					return;
				}
				const report = await runPublish({
					cwd: argv.cwd,
					tag: argv.tag,
					dryRun: argv.dryRun,
					...(argv.otp ? { otp: argv.otp as string } : {}),
				});
				if (report.status === "fail") {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"sync [steps..]",
			"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
			(y) =>
				y
					.positional("steps", {
						type: "string",
						array: true,
						describe:
							"Steps to run: labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki (default: all)",
					})
					.option("repo", {
						type: "string",
						describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runSync({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...(argv.repo ? { repo: argv.repo } : {}),
						...tokens,
						org: resolveOrg(argv, loaded.resolved),
					},
					...(argv.steps && argv.steps.length > 0 ? { steps: argv.steps as string[] } : {}),
				});
				if (report.summary.fail > 0) {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"run <task> [job] [passthrough..]",
			"Run a task locally (test, typecheck, lint, build, audit) — figures out turbo / the tool / the package manager",
			(y) =>
				y
					.positional("task", {
						type: "string",
						demandOption: true,
						describe: "Task name (test, typecheck, lint, build, audit). See `holocron run --help`.",
					})
					.positional("job", {
						type: "string",
						describe:
							"Sub-job within the task (e.g. `holocron run audit performance`). Omit to run every job. Only `audit` has jobs today.",
					})
					.positional("passthrough", {
						type: "string",
						array: true,
						describe: "Args forwarded to the tool — put them after `--`.",
					})
					.option("required", {
						type: "boolean",
						default: false,
						describe: "Fail (exit 1) if this repo has no such task, instead of skipping.",
					})
					.option("filter", {
						type: "string",
						describe: "turbo --filter=<pkg> passthrough (monorepo).",
					}),
			async (argv) => {
				const { logger } = buildCliLogger(argv, { command: "run" });
				// The task manifest drives `lint`'s linter set; other tasks are
				// filesystem-driven and ignore it. Missing / unparseable config → undefined.
				const config = await loadTasksConfig(argv.cwd as string).catch(() => undefined);
				const astromech = createAstromech({ cwd: argv.cwd, logger, config });
				const report = astromech.run(argv.task as string, {
					...(argv.job !== undefined ? { job: argv.job as string } : {}),
					passthrough: [
						...((argv.passthrough as string[] | undefined) ?? []),
						...((argv["--"] as string[] | undefined) ?? []),
					],
					dryRun: argv.dryRun,
					required: argv.required,
					...(argv.filter ? { filter: argv.filter as string } : {}),
				});
				if (report.status === "fail" || report.status === "unknown") process.exitCode = 1;
			}
		)
		.command(
			"ci",
			"Run the merge-gating checks locally, in CI order — 'will CI pass?'",
			(y) =>
				y
					.option("all", {
						type: "boolean",
						default: false,
						describe: "Run every `ci: true` task, not just the required ones.",
					})
					.option("filter", {
						type: "string",
						describe: "turbo --filter=<pkg> passthrough (monorepo).",
					}),
			async (argv) => {
				const { logger } = buildCliLogger(argv, { command: "ci" });
				const config = await loadTasksConfig(argv.cwd as string).catch(() => undefined);
				const astromech = createAstromech({ cwd: argv.cwd, logger, config });
				const report = astromech.ci({
					dryRun: argv.dryRun,
					scope: argv.all ? "all" : "required",
					...(argv.filter ? { filter: argv.filter as string } : {}),
				});
				if (report.status === "fail") process.exitCode = 1;
			}
		)
		.command(
			"sync-github",
			"Sync workflow templates and composite actions to theholocron/.github",
			(y) =>
				y
					.option("repo", {
						type: "string",
						default: "theholocron/.github",
						describe: "Target org/repo (default: theholocron/.github)",
					})
					.option("branch", {
						type: "string",
						describe:
							"Push to this branch instead of the default branch (enables PR-based workflow for protected repos)",
					})
					.option("pr", {
						type: "boolean",
						default: false,
						describe: "Open a PR after pushing to --branch (no-op without --branch)",
					})
					.option("message", {
						type: "string",
						describe: "Commit message (default: chore: sync from theholocron/holocron)",
					})
					.option("output-dir", {
						type: "string",
						describe: "Write generated files to this local directory instead of pushing (for validation)",
					}),
			async (argv) => {
				const outputDir = argv["output-dir"] as string | undefined;
				const parsed = tokenContext(argv.token);
				if (!parsed) return;
				let token: string;
				if (outputDir) {
					token = "no-token-needed";
				} else {
					try {
						token = resolveSyncToken({ cliToken: parsed.cliTokens?.["github"] ?? parsed.cliToken });
					} catch (err) {
						getLogger().error(`sync-github: ${err instanceof AuthError ? err.message : String(err)}`);
						process.exitCode = 1;
						return;
					}
				}
				const report = await runSyncGithub({
					token,
					repo: argv.repo,
					dryRun: argv.dryRun,
					...(argv.branch ? { branch: argv.branch } : {}),
					...(argv.pr ? { createPr: true } : {}),
					...(argv.message ? { message: argv.message } : {}),
					...(outputDir ? { outputDir } : {}),
				});
				if (report.status === "fail") {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"sync-readme",
			"Sync the Installation + Usage block in README.md from package.json",
			(y) =>
				y.option("dry-run", {
					type: "boolean",
					describe: "Print what would change without writing",
					default: false,
				}),
			async (argv) => {
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const report = await runSyncReadme({
					loaded,
					context: { repoRoot: argv.cwd, dryRun: argv.dryRun },
				});
				if (report.status === "fail") process.exitCode = 1;
			}
		)
		.command(
			"config show",
			"Print the resolved holocron config",
			() => {},
			async (argv) => {
				const loaded = await loadConfig(argv.cwd);
				console.log(JSON.stringify(loaded.resolved, null, 2));
			}
		)
		.command(
			"new [type] [name]",
			"Scaffold a new repo from a GitHub template (e.g. cli, react, nextjs, node, monorepo, base)",
			(y) =>
				y
					.positional("type", {
						type: "string",
						describe:
							"Template type — maps to theholocron/<type>-template " +
							"(e.g. cli, react, nextjs, node, monorepo, base)",
					})
					.positional("name", {
						type: "string",
						describe: "New repo name (kebab-case, e.g. my-tool)",
					})
					.option("description", {
						type: "string",
						describe: "Short description — replaces <description> placeholders in the template",
					})
					.option("homepage", {
						type: "string",
						describe: "Homepage URL — replaces <homepage> placeholders and appears in holocron.config.ts",
					})
					.option("vault", {
						type: "string",
						describe: "Vault provider: none, doppler, 1password, infisical",
					})
					.option("deployment", {
						type: "string",
						describe: "Deployment provider: none, vercel",
					})
					.option("agent", {
						type: "string",
						describe: "AI agent: claude, none",
					})
					.option("runtime-environment", {
						type: "string",
						describe: "Runtime environment: node, browser, universal, none",
					})
					.option("topics", {
						type: "string",
						describe: "Comma-separated repo topics (e.g. typescript,nodejs)",
					})
					.option("protection", {
						type: "string",
						describe: "Branch protection level: strict, balanced, minimal",
					})
					.option("open-source", {
						type: "boolean",
						describe: "Whether the repo is open source (default: true)",
					})
					.option("uses-external-packages", {
						type: "boolean",
						describe: "Whether the repo calls external APIs or services (default: true)",
					})
					.option("skills", {
						type: "string",
						describe: "Comma-separated agent skill names (e.g. git-safety,pr-workflow)",
					})
					.option("is-template", {
						type: "boolean",
						describe: "Mark the new repo as a GitHub template repository",
					})
					.option("org", {
						type: "string",
						default: "theholocron",
						describe: "GitHub org that owns the template and will own the new repo",
					})
					.option("verify", {
						type: "boolean",
						default: true,
						describe: "Run pnpm install + holocron setup after bootstrapping (--no-verify skips)",
					}),
			async (argv) => {
				try {
					const tokens = tokenContext(argv.token);
					if (!tokens) return;
					const adminToken = tokens.cliTokens?.["github"] ?? tokens.cliToken;

					let type = argv.type as string | undefined;
					let name = argv.name as string | undefined;
					let description = argv.description as string | undefined;
					let homepage = argv.homepage as string | undefined;
					let vaultProvider = argv.vault as string | undefined;
					let vaultProject: string | undefined;
					let vaultConfig: string | undefined;
					let deploymentProvider = argv.deployment as string | undefined;
					let agent = argv.agent as string | undefined;
					let runtimeEnvironment = argv.runtimeEnvironment as string | undefined;
					let topics: string[] = parseTopics(argv.topics as string | undefined);
					let protection = argv.protection as string | undefined;
					let openSource = argv.openSource as boolean | undefined;
					let usesExternalPackages = argv.usesExternalPackages as boolean | undefined;
					let skills: string[] = parseTopics(argv.skills as string | undefined);
					const isTemplate = argv.isTemplate as boolean | undefined;

					// Interactive wizard — skip any field already supplied as a CLI arg
					if (!type) {
						type = await select({
							message: "Template type:",
							choices: [
								{ name: "node    — Node.js library or tool", value: "node" },
								{ name: "cli     — CLI application (inquirer, chalk, yargs)", value: "cli" },
								{ name: "monorepo — Turbo monorepo", value: "monorepo" },
								{ name: "react   — React component library", value: "react" },
								{ name: "nextjs  — Next.js application", value: "nextjs" },
								{ name: "base    — Minimal repo (no package.json)", value: "base" },
							],
						});
					}

					if (!name) {
						name = await input({
							message: "Repo name (kebab-case):",
							validate: validateRepoName,
						});
						name = name.trim();
					}

					if (description === undefined) {
						description = await input({ message: "Short description:" });
					}

					if (homepage === undefined) {
						const raw = await input({ message: "Homepage URL (optional, Enter to skip):" });
						homepage = raw.trim() || undefined;
					}

					if (!runtimeEnvironment) {
						runtimeEnvironment = await select({
							message: "Runtime environment:",
							choices: [
								{ name: "node      — Node.js process", value: "node" },
								{ name: "browser   — Browser only", value: "browser" },
								{ name: "universal — Node.js + browser", value: "universal" },
								{ name: "none      — No runtime (docs, config, etc.)", value: "none" },
							],
							default: type === "base" ? "none" : "node",
						});
					}

					if (!vaultProvider) {
						vaultProvider = await select({
							message: "Vault provider:",
							choices: [
								{ name: "None", value: "none" },
								{ name: "Doppler", value: "doppler" },
								{ name: "1Password", value: "1password" },
								{ name: "Infisical", value: "infisical" },
							],
						});
					}

					if (vaultProvider === "doppler") {
						vaultProject = await input({ message: "Doppler project name:", default: name });
						vaultConfig = await input({ message: "Doppler config:", default: "dev" });
					} else if (vaultProvider === "1password" || vaultProvider === "infisical") {
						vaultProject = await input({
							message: `${vaultProvider === "1password" ? "1Password vault" : "Infisical project"} name:`,
							default: name,
						});
					}

					if (!deploymentProvider) {
						deploymentProvider = await select({
							message: "Deployment provider:",
							choices: [
								{ name: "None", value: "none" },
								{ name: "Vercel", value: "vercel" },
							],
						});
					}

					if (!agent) {
						agent = await select({
							message: "AI agent:",
							choices: [
								{ name: "Claude", value: "claude" },
								{ name: "None", value: "none" },
							],
						});
					}

					if (topics.length === 0) {
						const raw = await input({ message: "Topics (comma-separated, optional):" });
						topics = parseTopics(raw);
					}

					if (!protection) {
						protection = await select({
							message: "Branch protection:",
							choices: [
								{ name: "strict    — required reviews + passing checks", value: "strict" },
								{ name: "balanced  — required reviews, flexible checks", value: "balanced" },
								{ name: "minimal   — branch protection only", value: "minimal" },
							],
						});
					}

					if (openSource === undefined) {
						const ans = await select({
							message: "Open source?",
							choices: [
								{ name: "Yes", value: "yes" },
								{ name: "No", value: "no" },
							],
						});
						openSource = ans === "yes";
					}

					if (usesExternalPackages === undefined) {
						const ans = await select({
							message: "Uses external APIs or services?",
							choices: [
								{ name: "Yes", value: "yes" },
								{ name: "No", value: "no" },
							],
						});
						usesExternalPackages = ans === "yes";
					}

					if (skills.length === 0) {
						const raw = await input({ message: "Agent skills (comma-separated, optional):" });
						skills = parseTopics(raw);
					}

					if (!type) {
						getLogger().error("new: template type is required");
						process.exitCode = 1;
						return;
					}
					if (!name) {
						getLogger().error("new: repo name is required");
						process.exitCode = 1;
						return;
					}

					const report = await runNew({
						type,
						name,
						description: description || undefined,
						homepage,
						vaultProvider: (vaultProvider as "doppler" | "1password" | "infisical" | "none") ?? "none",
						vaultProject,
						vaultConfig,
						deploymentProvider: (deploymentProvider as "vercel" | "none") ?? "none",
						agent: (agent as "claude" | "none") ?? "claude",
						runtimeEnvironment: (runtimeEnvironment as "node" | "browser" | "universal" | "none") ?? "node",
						protection: protection ?? "strict",
						openSource: openSource ?? true,
						usesExternalPackages: usesExternalPackages ?? true,
						topics,
						skills,
						isTemplate,
						org: argv.org,
						token: adminToken,
						dryRun: argv.dryRun,
						noVerify: !argv.verify,
						cwd: argv.cwd,
					});
					if (report.status === "fail") process.exitCode = 1;
				} catch (err) {
					if (err instanceof NewError) {
						getLogger().error(`new: ${err.message}`);
						process.exitCode = 1;
						return;
					}
					throw err;
				}
			}
		)
		.command(
			"plugin create [slug] [vendor]",
			"Scaffold a new @theholocron/holocron-plugin-<slug> package",
			(y) =>
				y
					.positional("slug", { type: "string", describe: "Package slug (kebab-case)" })
					.positional("vendor", {
						type: "string",
						describe: "Vendor display name (PascalCase)",
					})
					.option("capability", {
						type: "string",
						describe:
							"Capability key: source|ci|secrets|environments|issues|deployment|storage|auth|vault|dns|tooling|notifications|analytics|errors|logs|wiki|workers",
					})
					.option("token-env", {
						type: "string",
						describe: "Holocron env var name (defaults to HOLOCRON_<VENDOR>_TOKEN)",
					})
					.option("vendor-env", {
						type: "string",
						describe: "Vendor-native env var name",
					})
					.option("base-url", {
						type: "string",
						describe: "REST base URL",
					})
					.option("verify", {
						type: "boolean",
						default: true,
						describe:
							"Run post-scaffold pnpm install + typecheck + lint + test (default true; --no-verify skips)",
					}),
			async (argv) => {
				try {
					const [slug, vendor] = await promptForPositionals(
						getEntry("plugin create"),
						argv as Record<string, unknown>
					);
					const { capability, vendorEnv, baseUrl } = await resolvePluginCreateInputs(
						{
							capability: argv.capability as string | undefined,
							vendorEnv: argv.vendorEnv as string | undefined,
							baseUrl: argv.baseUrl as string | undefined,
						},
						{
							selectCapability: () =>
								select({
									message: "Capability:",
									choices: Object.keys(CARDINALITY).map((k) => ({ name: k, value: k })),
								}),
							inputVendorEnv: () =>
								input({
									message: `Vendor-native env var for the ${vendor} token (e.g. MYVENDOR_API_KEY):`,
								}),
							inputBaseUrl: () =>
								input({
									message: `REST base URL for the ${vendor} API (e.g. https://api.myvendor.com):`,
								}),
						}
					);

					const report = runPluginCreate({
						slug: slug!,
						vendorName: vendor!,
						capability,
						vendorEnv,
						baseUrl,
						...(argv.tokenEnv ? { tokenEnv: argv.tokenEnv as string } : {}),
						dryRun: argv.dryRun,
						// Yargs: `--no-verify` flips `argv.verify` to false. We pass
						// the inverse to preserve the internal `noVerify` naming.
						noVerify: !argv.verify,
						cwd: argv.cwd,
					});
					if (report.status === "fail") process.exitCode = 1;
				} catch (err) {
					if (err instanceof PluginCreateError) {
						getLogger().error(`plugin create: ${err.message}`);
						process.exitCode = 1;
						return;
					}
					throw err;
				}
			}
		)
		.command(
			"upgrade",
			"Upgrade toolchain version pins across the repo",
			(y) =>
				y
					.command(
						"node [to]",
						"Scan the repo and update every Node.js version pin to a new major",
						(yy) =>
							yy
								.positional("to", {
									type: "number",
									describe: "Target Node.js major version (e.g., 22)",
								})
								.option("from", {
									type: "number",
									describe:
										"Current major version to replace. Auto-detected from .nvmrc / engines.node when omitted.",
								}),
						async (argv) => {
							const [to] = await promptForPositionals(
								getEntry("upgrade node"),
								argv as Record<string, unknown>
							);
							// Read upgrade.node.extra from holocron.config.json if present.
							// We read the raw file directly rather than through loadConfig because
							// the upgrade config is not part of the plugin schema.
							let extra: string[] = [];
							try {
								const raw = readFileSync(join(argv.cwd, "holocron.config.json"), "utf8");
								const cfg = JSON.parse(raw) as { upgrade?: { node?: { extra?: unknown } } };
								const extraRaw = cfg.upgrade?.node?.extra;
								if (Array.isArray(extraRaw)) {
									extra = extraRaw as string[];
								}
							} catch {
								/* no config or no upgrade section — fine */
							}

							const report = await runUpgradeNode({
								to: Number(to),
								...(argv.from != null ? { from: argv.from as number } : {}),
								cwd: argv.cwd,
								dryRun: argv.dryRun,
								extra,
							});
							if (report.status === "fail") {
								if (report.message) getLogger().error(`upgrade node: ${report.message}`);
								process.exitCode = 1;
							}
						}
					)
					.command(
						"deps",
						"Bump every @theholocron/* pin to latest and migrate holocron.config.ts to the current preset API",
						(yy) =>
							yy.option("pins-only", {
								type: "boolean",
								default: false,
								describe: "Only bump the catalog pins — skip the holocron.config.ts migration",
							}),
						async (argv) => {
							const report = await runUpgradeDeps({
								cwd: argv.cwd,
								dryRun: argv.dryRun,
								pinsOnly: argv.pinsOnly as boolean,
							});
							if (report.status === "fail") {
								if (report.message) getLogger().error(`upgrade deps: ${report.message}`);
								process.exitCode = 1;
							}
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchMenu(
								COMMAND_REGISTRY.filter((e) => e.group === "upgrade"),
								argv,
								"upgrade — choose a subcommand:",
								"Run `holocron upgrade --help` to see available upgrade subcommands."
							);
						}
					),
			() => {}
		)
		.command(
			"auth <subcommand>",
			"Manage bootstrap credentials in the OS keyring",
			(y) =>
				y
					.command(
						"set [provider] [value]",
						"Verify + store a bootstrap token for a provider",
						(yy) => yy.positional("provider", { type: "string" }).positional("value", { type: "string" }),
						async (argv) => {
							const [provider] = await promptForPositionals(
								getEntry("auth set"),
								argv as Record<string, unknown>
							);
							const result = await runAuthSet({
								provider: provider!,
								...(argv.value ? { positional: argv.value as string } : {}),
								...(argv.org ? { org: argv.org as string } : {}),
							});
							if (result.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"unset [provider]",
						"Remove a stored bootstrap token",
						(yy) => yy.positional("provider", { type: "string" }),
						async (argv) => {
							const [provider] = await promptForPositionals(
								getEntry("auth unset"),
								argv as Record<string, unknown>
							);
							runAuthUnset({ provider: provider! });
						}
					)
					.command(
						"check [provider]",
						"Re-verify a stored bootstrap token",
						(yy) => yy.positional("provider", { type: "string" }),
						async (argv) => {
							const [provider] = await promptForPositionals(
								getEntry("auth check"),
								argv as Record<string, unknown>
							);
							const result = await runAuthCheck({
								provider: provider!,
								...(argv.org ? { org: argv.org as string } : {}),
							});
							if (result.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"list",
						"List every provider with a stored bootstrap token",
						() => {},
						async () => {
							await runAuthList();
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchMenu(
								COMMAND_REGISTRY.filter((e) => e.group === "auth"),
								argv,
								"auth — choose a subcommand:",
								"Run `holocron auth --help` to see available auth subcommands."
							);
						}
					),
			() => {}
		)
		.command(
			"$0",
			false,
			() => {},
			async (argv) => {
				await launchMenu(
					COMMAND_REGISTRY.filter((e) => !e.group),
					argv
				);
			}
		)
		.strict()
		.help()
		.epilogue(
			"Execution contexts:\n" +
				`  global      works from a bare 'npm i -g': ${commandsInContext("global").join(", ")}\n` +
				`  repo-aware  needs ./holocron.config in cwd: ${commandsInContext("repo-aware").join(", ")}\n` +
				`  workspace   also needs the plugin packages: ${commandsInContext("workspace").join(", ")}\n` +
				"  https://theholocron.github.io/holocron/execution-contexts"
		)
		.fail((msg, err) => {
			// A user-facing error (a `workspace` command with no resolvable
			// plugins, a missing `holocron.config`) — its message is the whole
			// story. Print that: no usage dump, no stack trace.
			if (err instanceof Error && USER_FACING_ERRORS.has(err.name)) {
				captureException(err);
				getLogger().error(err.message);
				errorReported = true;
				process.exitCode = 1;
				return;
			}
			// Anything else a handler threw: hand back to the outer catch so
			// telemetry + the generic path own it.
			if (err) throw err;
			// A yargs validation failure (unknown command, missing positional):
			// keep yargs' own message.
			getLogger().error(msg);
			errorReported = true;
			process.exitCode = 1;
		})
		.parse();
} catch (err) {
	captureException(err);
	// User-facing errors carry a self-contained message — print it instead of
	// letting a raw stack trace escape (unless `.fail()` already did).
	if (!errorReported && err instanceof Error && USER_FACING_ERRORS.has(err.name)) {
		getLogger().error(err.message);
	}
	if (!process.exitCode) process.exitCode = 1;
}

finishCommand(!process.exitCode);
endSession();
// `--debug` / `--verbose`: surface the correlation id for Axiom lookup. This is
// user-facing reference output (print semantics); cli.ts has no `print` injection.
const rid = getRunId();
if (printRunId && rid) console.log(`Run ID: ${rid}`);
const notify = await updateCheckPromise;
notify?.();
await flush();

/**
 * Parse `--scope` strings: `repo` | `env=NAME` | `org=NAME`.
 */
function parseScope(
	s: string
): { kind: "repo" } | { kind: "environment"; name: string } | { kind: "organization"; name: string } {
	if (s === "repo") return { kind: "repo" };
	if (s.startsWith("env=")) return { kind: "environment", name: s.slice("env=".length) };
	if (s.startsWith("org=")) return { kind: "organization", name: s.slice("org=".length) };
	throw new Error(`invalid --scope "${s}" — expected "repo", "env=<name>", or "org=<name>"`);
}
