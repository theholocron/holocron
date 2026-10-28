import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { input, select } from "@inquirer/prompts";
import { deployOnRelease } from "@theholocron/astromech";
import { LOG_LEVELS } from "@theholocron/observability/core";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { applyResolvedConfig, launchGroupMenu, parseScope, resolveOrg, tokenContext } from "./cli-support/index.js";
import { authCommand } from "./commands/auth/auth.command.js";
import { runCleanupPreview } from "./commands/cleanup-preview/index.js";
import { cloneCommand } from "./commands/clone/clone.command.js";
import { configShowCommand } from "./commands/config-show/index.js";
import { commandsInContext } from "./commands/contexts/index.js";
import { runDeploy, runDeployFromFiles } from "./commands/deploy/index.js";
import { doctorCommand } from "./commands/doctor/index.js";
import { resolveMonitoringChecks, runMonitoringCheck } from "./commands/monitoring-check/index.js";
import { runMonitoringResolveChecks } from "./commands/monitoring-resolve-checks/index.js";
import { resolveVercelBypassHeaders, runMonitoringRunResolved } from "./commands/monitoring-run-resolved/index.js";
import { NewError, parseTopics, runNew, validateRepoName } from "./commands/new/index.js";
import { runNotificationsChannelAdd } from "./commands/notifications-channel-add/index.js";
import { runNotificationsCreateServer } from "./commands/notifications-create-server/index.js";
import { runNotificationsLink } from "./commands/notifications-link/index.js";
import { runNotificationsSetup } from "./commands/notifications-setup/index.js";
import { runNotificationsSyncRoles } from "./commands/notifications-sync-roles/index.js";
import { runNpmBumpVersions } from "./commands/npm-bump-versions/index.js";
import { PluginCreateError, resolvePluginCreateInputs, runPluginCreate } from "./commands/plugin-create/index.js";
import { probeCommand } from "./commands/probe/index.js";
import { resolveOtp, runPublish, runSteadyPublish, runSyncTrust } from "./commands/publish/index.js";
import { runCommand } from "./commands/run/run.command.js";
import { runSecretSet } from "./commands/secret-set/index.js";
import { runSecretsSync } from "./commands/secrets-sync/index.js";
import { runSetup } from "./commands/setup/index.js";
import { skillsCommand } from "./commands/skills/index.js";
import { runSync } from "./commands/sync/index.js";
import { syncCommand } from "./commands/sync/sync.command.js";
import { runSyncReadme } from "./commands/sync-readme/index.js";
import { runUpgradeDeps } from "./commands/upgrade-deps/index.js";
import { runUpgradeNode } from "./commands/upgrade-node/index.js";
import { loadConfig } from "./config/index.js";
import { env } from "./env/index.js";
import {
	buildRunMenuEntries,
	COMMAND_REGISTRY,
	DRY_RUN_NOOP_EXIT_CODE,
	DRY_RUN_PREVIEW_ENV_VAR,
	getEntry,
	launchMenu,
	listRunnableTasks,
} from "./interactive-menu/index.js";
import { buildCliLogger, getRunId, reportError } from "./observability/logger/index.js";
import { captureException, endSession, flush, init, startCommand } from "./observability/telemetry/index.js";
import { CARDINALITY } from "./plugin/index.js";
import { commandFailureMessage, USER_FACING_ERRORS } from "./ui/command-failure/index.js";
import { promptForPositionals, style } from "./ui/index.js";
import { checkForUpdates } from "./update-notifier/index.js";

const { version: CLI_VERSION } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
	version: string;
};

/** Whether to print the correlation id at command end (`--debug` / `--verbose`). */
let printRunId = false;

/**
 * Print the dim version line once per terminal session — keyed by the
 * parent shell's PID, since that's stable across repeated bare `holocron`
 * invocations in the same shell but changes in a new tab/window. A marker
 * file in the OS tmpdir tracks whether this shell has already seen it, so
 * re-running `holocron` doesn't repeat the line every time.
 */
function printVersionHeaderOnce(): void {
	const marker = join(tmpdir(), `.holocron-version-shown-${process.ppid}`);
	if (existsSync(marker)) return;
	console.log(style.dim(`v${CLI_VERSION}`));
	writeFileSync(marker, "");
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
		.version(CLI_VERSION)
		.alias("version", "v")
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
		.option("skip-dry-run", {
			type: "boolean",
			default: false,
			describe:
				"Interactive mode only: skip the automatic dry-run preview for a " +
				"dry-run-capable command and run for real immediately.",
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
		.option("log", {
			type: "string",
			choices: LOG_LEVELS,
			describe:
				"Show structured logger output at this level. Local/interactive runs are " +
				"quiet by default (no console output regardless of level) — this opts back in.",
		})
		.middleware((argv) => {
			const name = (argv._ as string[]).slice(0, 3).join(" ") || "unknown";
			printRunId = Boolean(argv.debug || argv.verbose);
			// Establish the root logger first (command name + flags + env) so its
			// `runId` is available to tag telemetry events. Handlers that load a
			// config call `buildCliLogger(argv, { configLevel })` again to fold in
			// the lowest-priority level + Axiom-dataset sources.
			buildCliLogger(argv, { command: name, org: argv.org });
			finishCommand = startCommand(name);
		})
		// ── commands ────────────────────────────────────────────────────────
		.command(cloneCommand as never)
		.command(doctorCommand as never)
		.command(skillsCommand as never)
		.command(runCommand as never)
		.command(configShowCommand as never)
		.command(authCommand as never)
		.command(
			"$0",
			false,
			() => {},
			async (argv) => {
				printVersionHeaderOnce();
				const runEntries = buildRunMenuEntries(await listRunnableTasks(argv));
				await launchMenu([...COMMAND_REGISTRY, ...runEntries], argv);
			}
		)
		.command(
			"repo",
			"Set up, sync and upgrade the current repo",
			(g) =>
				g
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
										"Install git hooks (.husky/pre-push → holocron run ci). Default: on for protection:'strict'. --no-hooks to skip.",
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
						"sync [steps..]",
						"Sync state from config to the provider and local files (labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki)",
						(y) =>
							y
								.command(
									"readme",
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
										if (report.status === "fail") {
											if (report.message) reportError(`repo sync readme: ${report.message}`);
											process.exitCode = 1;
										}
									}
								)
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
											getEntry("repo upgrade node"),
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
											if (report.message) reportError(`upgrade node: ${report.message}`);
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
											describe:
												"Only bump the catalog pins — skip the holocron.config.ts migration",
										}),
									async (argv) => {
										const report = await runUpgradeDeps({
											cwd: argv.cwd,
											dryRun: argv.dryRun,
											pinsOnly: argv.pinsOnly as boolean,
										});
										if (report.status === "fail") {
											if (report.message) reportError(`upgrade deps: ${report.message}`);
											process.exitCode = 1;
										}
									}
								)
								.command(
									"$0",
									false,
									() => {},
									async (argv) => {
										await launchGroupMenu("repo upgrade", argv);
									}
								),
						() => {}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchGroupMenu("repo", argv);
						}
					),
			() => {}
		)
		.command(
			"new",
			"Scaffold a new repo or plugin",
			(g) =>
				g
					.command(
						"repo [type] [name]",
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
									describe:
										"Homepage URL — replaces <homepage> placeholders and appears in holocron.config.ts",
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
									describe:
										"Run pnpm install + holocron repo setup after bootstrapping (--no-verify skips)",
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
											{
												name: "cli     — CLI application (inquirer, chalk, yargs)",
												value: "cli",
											},
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
											{
												name: "balanced  — required reviews, flexible checks",
												value: "balanced",
											},
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
									reportError("new: template type is required");
									process.exitCode = 1;
									return;
								}
								if (!name) {
									reportError("new: repo name is required");
									process.exitCode = 1;
									return;
								}

								const report = await runNew({
									type,
									name,
									description: description || undefined,
									homepage,
									vaultProvider:
										(vaultProvider as "doppler" | "1password" | "infisical" | "none") ?? "none",
									vaultProject,
									vaultConfig,
									deploymentProvider: (deploymentProvider as "vercel" | "none") ?? "none",
									agent: (agent as "claude" | "none") ?? "claude",
									runtimeEnvironment:
										(runtimeEnvironment as "node" | "browser" | "universal" | "none") ?? "node",
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
									reportError(`new: ${err.message}`);
									process.exitCode = 1;
									return;
								}
								throw err;
							}
						}
					)
					.command(
						"plugin [slug] [vendor]",
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
									getEntry("new plugin"),
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
									reportError(`plugin create: ${err.message}`);
									process.exitCode = 1;
									return;
								}
								throw err;
							}
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchGroupMenu("new", argv);
						}
					),
			() => {}
		)
		.command(probeCommand as never)
		.command(
			"secrets",
			"Set secrets and sync vault environments",
			(g) =>
				g
					.command(
						"set [name] [value]",
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
									describe:
										"Read the secret value from the named env var (otherwise: env var matching <name>)",
								})
								.option("scope", {
									type: "string",
									default: "repo",
									describe: 'Scope: "repo" (default), "env=<name>", or "org=<name>"',
								}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const [name] = await promptForPositionals(
								getEntry("secrets set"),
								argv as Record<string, unknown>
							);
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
						"sync [environmentId]",
						"Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
						(y) =>
							y
								.positional("environmentId", {
									type: "string",
									describe: "Vault environment id to read (1P Environment id, etc.)",
								})
								.option("project-id", {
									type: "string",
									describe:
										"Deployment project id (e.g., Vercel prj_*). Required when deployment is loaded.",
								})
								.option("target", {
									type: "array",
									default: ["production", "preview"] as Array<
										"development" | "preview" | "production"
									>,
									describe: "Deployment targets to sync to. Defaults to production + preview.",
								})
								.option("worker", {
									type: "string",
									describe:
										"A deployed Worker (script name) to set every vault key on as a secret, e.g. comlink.",
								})
								.option("github-secret", {
									type: "array",
									describe:
										"Vault key(s) to push to GH Actions secrets (repeatable). Omit to push every key.",
								})
								.option("github-secret-scope", {
									type: "string",
									default: "repo",
									describe:
										'Scope applied to every --github-secret key: "repo" (default), "env=<name>", or "org=<name>".',
								}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const githubSecretScope = parseScope(argv.githubSecretScope as string);
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
								...(argv.worker ? { workerScript: argv.worker } : {}),
								...(argv.githubSecret?.length
									? { githubSecretKeys: argv.githubSecret as string[] }
									: {}),
								githubSecretScope,
								targets: argv.target as Array<"development" | "preview" | "production">,
							});
							if (report.summary.fail > 0) {
								process.exitCode = 1;
							}
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchGroupMenu("secrets", argv);
						}
					),
			() => {}
		)
		.command(
			"notifications",
			"Provision notification channels, webhooks and roles",
			(g) =>
				g
					.command(
						"channel",
						"Manage notification channels",
						(c) =>
							c
								.command(
									"add [name]",
									"Create a channel, optionally with a webhook whose URL is stored as a secret",
									(y) =>
										y
											.positional("name", {
												type: "string",
												describe: "Channel name (e.g. alerts)",
											})
											.option("category", {
												type: "string",
												describe: "Put the channel under this category (created if missing)",
											})
											.option("topic", { type: "string", describe: "Channel topic" })
											.option("with-webhook", {
												type: "boolean",
												default: false,
												describe:
													"Also create a webhook and store its URL as a secret (the URL is never printed)",
											})
											.option("webhook-name", {
												type: "string",
												describe: "Webhook display name (default: the channel name)",
											})
											.option("secret", {
												type: "string",
												describe:
													"Secret to store the URL in (default: HOLOCRON_NOTIFY_WEBHOOK_<CHANNEL>)",
											})
											.option("scope", {
												type: "string",
												describe:
													'Secret scope: "repo", "env=<name>" or "org=<name>" (default: the org)',
											})
											.option("provider", {
												type: "string",
												describe: "Which notifications provider, when several can provision",
											}),
									async (argv) => {
										const tokens = tokenContext(argv.token);
										if (!tokens) return;
										const [name] = await promptForPositionals(
											getEntry("notifications channel add"),
											argv as Record<string, unknown>
										);
										const loaded = await loadConfig(argv.cwd);
										applyResolvedConfig(argv, loaded.resolved);
										const report = await runNotificationsChannelAdd({
											loaded,
											context: {
												repoRoot: argv.cwd,
												dryRun: argv.dryRun,
												...tokens,
												org: resolveOrg(argv, loaded.resolved),
											},
											name: name!,
											...(argv.category ? { category: argv.category as string } : {}),
											...(argv.topic ? { topic: argv.topic as string } : {}),
											...(argv.withWebhook ? { withWebhook: true } : {}),
											...(argv.webhookName ? { webhookName: argv.webhookName as string } : {}),
											...(argv.secret ? { secret: argv.secret as string } : {}),
											...(argv.scope ? { scope: parseScope(argv.scope as string) } : {}),
											...(argv.provider ? { provider: argv.provider as string } : {}),
										});
										if (report.status === "fail") process.exitCode = 1;
									}
								)
								.command(
									"$0",
									false,
									() => {},
									async (argv) => {
										await launchGroupMenu("notifications channel", argv);
									}
								),
						() => {}
					)
					.command(
						"setup",
						"Apply the server layout a notifications provider declares in holocron.config.ts",
						(y) =>
							y
								.option("scope", {
									type: "string",
									describe:
										'Webhook secret scope: "repo", "env=<name>" or "org=<name>" (default: the org)',
								})
								.option("provider", {
									type: "string",
									describe: "Which notifications provider, when several can provision",
								}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const loaded = await loadConfig(argv.cwd);
							applyResolvedConfig(argv, loaded.resolved);
							const report = await runNotificationsSetup({
								loaded,
								context: {
									repoRoot: argv.cwd,
									dryRun: argv.dryRun,
									...tokens,
									org: resolveOrg(argv, loaded.resolved),
								},
								...(argv.scope ? { scope: parseScope(argv.scope as string) } : {}),
								...(argv.provider ? { provider: argv.provider as string } : {}),
							});
							if (report.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"create-server",
						"Create the server the layout describes, apply it, invite its owner and hand it over",
						(y) =>
							y
								.option("name", {
									type: "string",
									describe: "What the new server is called (not needed with --resume)",
								})
								.option("owner", {
									type: "string",
									demandOption: true,
									describe:
										"The member id (on the provider) who will own the server once they have joined",
								})
								.option("provider", {
									type: "string",
									describe: "Which notifications provider, when several can create a server",
								})
								.option("force", {
									type: "boolean",
									default: false,
									describe:
										"Create another server although the config already names one, and replace its id",
								})
								.option("resume", {
									type: "boolean",
									default: false,
									describe: "The server exists: skip creating and applying, and finish the hand-over",
								}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const loaded = await loadConfig(argv.cwd);
							applyResolvedConfig(argv, loaded.resolved);
							const report = await runNotificationsCreateServer({
								loaded,
								context: {
									repoRoot: argv.cwd,
									dryRun: argv.dryRun,
									...tokens,
									org: resolveOrg(argv, loaded.resolved),
								},
								owner: argv.owner as string,
								...(argv.name ? { name: argv.name as string } : {}),
								...(argv.provider ? { provider: argv.provider as string } : {}),
								...(argv.force ? { force: true } : {}),
								...(argv.resume ? { resume: true } : {}),
							});
							if (report.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"link",
						"Link your server account to your GitHub account by signing in with the provider",
						(y) =>
							y.option("provider", {
								type: "string",
								describe: "Which notifications provider, when several can sign members in",
							}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const loaded = await loadConfig(argv.cwd);
							applyResolvedConfig(argv, loaded.resolved);
							const report = await runNotificationsLink({
								loaded,
								context: {
									repoRoot: argv.cwd,
									dryRun: argv.dryRun,
									...tokens,
									org: resolveOrg(argv, loaded.resolved),
								},
								...(argv.provider ? { provider: argv.provider as string } : {}),
							});
							if (report.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"sync-roles",
						"Make who holds a server role match a team, through the links file",
						(y) =>
							y
								.option("provider", {
									type: "string",
									describe: "Which notifications provider, when several can manage roles",
								})
								.option("keep", {
									type: "boolean",
									default: false,
									describe:
										"Give the role to new team members but do not take it from people who left",
								}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const loaded = await loadConfig(argv.cwd);
							applyResolvedConfig(argv, loaded.resolved);
							const report = await runNotificationsSyncRoles({
								loaded,
								context: {
									repoRoot: argv.cwd,
									dryRun: argv.dryRun,
									...tokens,
									org: resolveOrg(argv, loaded.resolved),
								},
								...(argv.provider ? { provider: argv.provider as string } : {}),
								keep: argv.keep as boolean,
							});
							if (report.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchGroupMenu("notifications", argv);
						}
					),
			() => {}
		)
		.command(syncCommand as never)
		.command(
			"package",
			"Version and publish workspace packages",
			(g) =>
				g
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
								getEntry("package bump-versions"),
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
										"package to exist before Trusted Publishing can be configured for it). Skips the " +
										"steady-state OIDC path below — use only for a package's very first publish.",
								})
								.option("tag", {
									type: "string",
									describe:
										"npm distribution tag. Defaults to alpha for --initial, latest for a steady-state publish.",
								})
								.option("otp", {
									type: "string",
									describe:
										"One-time password from your authenticator (required if npm needs 2FA for writes)",
								})
								.option("sync-trust", {
									type: "array",
									describe:
										"Migrate npm Trusted Publisher config to a new workflow filename across every public " +
										"package: --sync-trust <old-file> <new-file>. See issue #689 — npm requires fresh " +
										"interactive 2FA per package; re-run after approving the printed authUrl if it stops early.",
								})
								.option("repo", {
									type: "string",
									describe:
										"owner/repo for Trusted Publisher config (--sync-trust). Defaults to theholocron/holocron.",
								})
								.option("provenance", {
									type: "boolean",
									default: true,
									describe:
										"Publish with --provenance (steady-state only). Default on — free under CI/OIDC.",
								})
								.option("skip-already-published", {
									type: "boolean",
									default: false,
									describe:
										"Steady-state only: check `npm view <pkg>@<version>` before publishing each package and " +
										"skip it if that exact version already exists, instead of one bulk publish. For repos " +
										"that ship many independently-versioned packages where a release doesn't bump every one.",
								}),
						async (argv) => {
							const otp = resolveOtp(argv.otp as string | undefined, env);
							if (argv.syncTrust) {
								const [oldFile, newFile] = argv.syncTrust as [string?, string?];
								if (!oldFile || !newFile) {
									reportError(
										"publish --sync-trust requires exactly two values: <old-file> <new-file>"
									);
									process.exitCode = 1;
									return;
								}
								const report = await runSyncTrust({
									cwd: argv.cwd,
									oldFile,
									newFile,
									dryRun: argv.dryRun,
									...(argv.repo ? { repo: argv.repo as string } : {}),
								});
								if (report.status === "fail") {
									process.exitCode = 1;
								}
								return;
							}
							if (argv.initial) {
								const report = await runPublish({
									cwd: argv.cwd,
									dryRun: argv.dryRun,
									...(argv.tag ? { tag: argv.tag as string } : {}),
									...(otp ? { otp } : {}),
								});
								if (report.status === "fail") {
									process.exitCode = 1;
								} else if (
									report.status === "ok" &&
									report.packageNames.length === 0 &&
									env.get(DRY_RUN_PREVIEW_ENV_VAR) === "1"
								) {
									// Every publicly publishable package already exists on npm —
									// nothing the real run would do either. Same signal clone's
									// "already cloned" case uses to skip the menu's follow-up
									// "proceed with the real run?" question.
									process.exitCode = DRY_RUN_NOOP_EXIT_CODE;
								}
								return;
							}
							const report = await runSteadyPublish({
								cwd: argv.cwd,
								dryRun: argv.dryRun,
								provenance: argv.provenance as boolean,
								skipAlreadyPublished: argv.skipAlreadyPublished as boolean,
								...(argv.tag ? { tag: argv.tag as string } : {}),
								...(otp ? { otp } : {}),
							});
							if (report.status === "fail") {
								process.exitCode = 1;
							}
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchGroupMenu("package", argv);
						}
					),
			() => {}
		)
		.command(
			"deploy [branch]",
			"Trigger a deployment via the configured `deployment` capability",
			(y) =>
				y
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
							const [pr] = await promptForPositionals(
								getEntry("deploy cleanup-preview"),
								argv as Record<string, unknown>
							);
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
						"on-release",
						"Deploy every workspace package whose delivery.deploy task is `on: release` — run by the delivery.publish workflow's deploy job",
						(y) =>
							y
								.option("channel", {
									type: "string",
									default: "",
									describe:
										"The release's channel: its prerelease identifier (`alpha`); empty or `main` for a stable release.",
								})
								.option("from", {
									type: "string",
									describe:
										"The previous release's commit, to diff against. Omit when there is none.",
								})
								.option("to", {
									type: "string",
									describe: "The release commit. Default HEAD.",
								}),
						async (argv) => {
							const report = await deployOnRelease({
								cwd: argv.cwd as string,
								channel: argv.channel as string,
								// An empty value (an unset workflow output) means "not given".
								...(argv.from ? { from: argv.from as string } : {}),
								...(argv.to ? { to: argv.to as string } : {}),
								dryRun: argv.dryRun,
								print: (line) => console.log(line),
							});
							if (report.status === "fail") process.exitCode = 1;
						}
					)
					.positional("branch", {
						type: "string",
						describe: "Git branch to deploy (omit when using --files)",
					})
					// Not `demandOption`: yargs would make every nested subcommand
					// (`deploy on-release`, `deploy cleanup-preview`) inherit it. The
					// handler below enforces it for the trigger itself.
					.option("project-id", {
						type: "string",
						describe: "Deployment project id (required to trigger a deployment, e.g. Vercel prj_*)",
					})
					.option("target", {
						type: "string",
						choices: ["production", "staging"] as const,
						describe: "Named environment to deploy into. Omit for a branch preview.",
					})
					.option("files", {
						type: "string",
						describe:
							"Deploy from a local directory of source files instead of a Git branch — calls deployFunction(), no linked repo required. Conflicts with `branch`.",
					})
					.conflicts("files", "branch"),
			async (argv) => {
				if (!argv.projectId) {
					reportError("deploy: missing required argument --project-id");
					process.exitCode = 1;
					return;
				}
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const loaded = await loadConfig(argv.cwd);
				applyResolvedConfig(argv, loaded.resolved);
				const context = {
					repoRoot: argv.cwd,
					dryRun: argv.dryRun,
					...tokens,
					org: resolveOrg(argv, loaded.resolved),
				};

				if (argv.files) {
					const report = await runDeployFromFiles({
						loaded,
						context,
						projectId: argv.projectId as string,
						dir: argv.files as string,
						...(argv.target ? { target: argv.target as "production" | "staging" } : {}),
					});
					if (report.status === "fail") {
						process.exitCode = 1;
					}
					return;
				}

				const [branch] = await promptForPositionals(getEntry("deploy"), argv as Record<string, unknown>);
				const report = await runDeploy({
					loaded,
					context,
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
			"monitoring",
			"Run monitoring checks ad hoc, outside the configured provider",
			(g) =>
				g
					.command(
						"check <url>",
						"Run every configured `monitoring` check against a given URL instead of its own configured url",
						(y) =>
							y
								.positional("url", {
									type: "string",
									describe:
										"URL to test every configured check against (e.g. a PR's preview deployment)",
								})
								.option("vercel-project", {
									type: "string",
									describe:
										"Expected Vercel project id/name `url` must resolve to before the Deployment Protection bypass header (VERCEL_PROTECTION_BYPASS_SECRET) is attached. Omitted → the header is never attached, regardless of that env var.",
								}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const [url] = await promptForPositionals(
								getEntry("monitoring check"),
								argv as Record<string, unknown>
							);
							const loaded = await loadConfig(argv.cwd);
							applyResolvedConfig(argv, loaded.resolved);
							// Deployment Protection (on by default for Vercel Preview
							// deployments, holocron#1030) redirects an unauthenticated
							// request to Vercel's own SSO login before it ever reaches
							// the app being checked — this header is Vercel's documented
							// way for an automated caller to skip that wall. Read
							// directly from the env rather than added to the CLI's own
							// `--token`-resolution chain: it's not an API credential this
							// command calls a vendor with, just a header forwarded
							// as-is to whatever URL the caller names. Never attached
							// without first verifying (via --vercel-project) that `url`
							// actually belongs to the expected project — sourcery review
							// on holocron#1032: a bare *.vercel.app hostname check proves
							// nothing, since anyone can register their own Vercel
							// project. This is the exact same gate `monitoring
							// run-resolved` uses for the CI split.
							const { headers } = await resolveVercelBypassHeaders({
								url: url!,
								...(argv.vercelProject ? { vercelProject: argv.vercelProject as string } : {}),
								...(process.env["VERCEL_TOKEN"] ? { vercelToken: process.env["VERCEL_TOKEN"] } : {}),
								...(process.env["VERCEL_TEAM_ID"]
									? { vercelTeamId: process.env["VERCEL_TEAM_ID"] }
									: {}),
								...(process.env["VERCEL_PROTECTION_BYPASS_SECRET"]
									? { bypassSecret: process.env["VERCEL_PROTECTION_BYPASS_SECRET"] }
									: {}),
							});
							const report = await runMonitoringCheck({
								loaded,
								context: {
									repoRoot: argv.cwd,
									dryRun: argv.dryRun,
									...tokens,
									org: resolveOrg(argv, loaded.resolved),
								},
								url: url!,
								...(headers ? { headers } : {}),
							});
							if (report.status === "fail") {
								process.exitCode = 1;
							}
						}
					)
					.command(
						"resolve-checks",
						"Load config/plugins and write the configured `monitoring` checks to a file as JSON — the untrusted half of the delivery.previewCheck split (holocron#1030/#1032)",
						(y) =>
							y.option("out", {
								type: "string",
								demandOption: true,
								describe: "File path to write the resolved checks to",
							}),
						async (argv) => {
							const tokens = tokenContext(argv.token);
							if (!tokens) return;
							const loaded = await loadConfig(argv.cwd);
							applyResolvedConfig(argv, loaded.resolved);
							await runMonitoringResolveChecks({
								loaded,
								context: {
									repoRoot: argv.cwd,
									dryRun: argv.dryRun,
									...tokens,
									org: resolveOrg(argv, loaded.resolved),
								},
								outFile: argv.out as string,
							});
						}
					)
					.command(
						"run-resolved <url>",
						"Run an already-resolved check list (from `monitoring resolve-checks`) against a URL — no config/plugin loading at all, the trusted half of the delivery.previewCheck split (holocron#1030/#1032)",
						(y) =>
							y
								.positional("url", {
									type: "string",
									describe: "URL to run every resolved check against",
								})
								.option("checks-file", {
									type: "string",
									demandOption: true,
									describe:
										"File path to read the resolved checks from (written by `monitoring resolve-checks`)",
								})
								.option("vercel-project", {
									type: "string",
									describe:
										"Expected Vercel project id/name `url` must resolve to before the Deployment Protection bypass header (VERCEL_PROTECTION_BYPASS_SECRET) is attached. Omitted → the header is never attached.",
								}),
						async (argv) => {
							const checks = JSON.parse(readFileSync(argv.checksFile as string, "utf8")) as Awaited<
								ReturnType<typeof resolveMonitoringChecks>
							>;
							const report = await runMonitoringRunResolved({
								checks,
								url: argv.url as string,
								...(argv.vercelProject ? { vercelProject: argv.vercelProject as string } : {}),
								...(process.env["VERCEL_TOKEN"] ? { vercelToken: process.env["VERCEL_TOKEN"] } : {}),
								...(process.env["VERCEL_TEAM_ID"]
									? { vercelTeamId: process.env["VERCEL_TEAM_ID"] }
									: {}),
								...(process.env["VERCEL_PROTECTION_BYPASS_SECRET"]
									? { bypassSecret: process.env["VERCEL_PROTECTION_BYPASS_SECRET"] }
									: {}),
							});
							if (report.status === "fail") {
								process.exitCode = 1;
							}
						}
					)
					.command(
						"$0",
						false,
						() => {},
						async (argv) => {
							await launchGroupMenu("monitoring", argv);
						}
					),
			() => {}
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
				reportError(err.message);
				errorReported = true;
				process.exitCode = 1;
				return;
			}
			// Anything else a handler threw: hand back to the outer catch so
			// telemetry + the generic path own it.
			if (err) throw err;
			// A yargs validation failure (unknown command, missing positional):
			// keep yargs' own message.
			reportError(msg);
			errorReported = true;
			process.exitCode = 1;
		})
		.parse();
} catch (err) {
	captureException(err);
	// Whatever a handler threw is printed (unless `.fail()` already did): a command that throws a plain Error must
	// not exit 1 in silence. No stack trace either way; telemetry has it.
	if (!errorReported) reportError(commandFailureMessage(err));
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
