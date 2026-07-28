import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { AuthError, createFeatureResolver } from "./auth-resolver.js";
import type { CapabilityKey } from "./capabilities/index.js";
import { CARDINALITY } from "./capabilities/index.js";
import { runAuthCheck, runAuthList, runAuthSet, runAuthUnset } from "./commands/auth.js";
import { runClone } from "./commands/clone.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { NewError, runNew } from "./commands/new.js";
import { runNpmBumpVersions } from "./commands/npm-bump-versions.js";
import { runNpmPublishInitial } from "./commands/npm-publish-initial.js";
import { PluginCreateError, runPluginCreate } from "./commands/plugin-create/index.js";
import { runSecretSet } from "./commands/secret-set.js";
import { runSecretsSync } from "./commands/secrets-sync.js";
import { runSetup } from "./commands/setup.js";
import { runSkillsInstall, runSkillsRemove, runSkillsUpdate } from "./commands/skills.js";
import { runSync } from "./commands/sync.js";
import { runSyncGithub } from "./commands/sync-github.js";
import { runUpgradeNode } from "./commands/upgrade-node.js";
import { loadConfig } from "./load-config.js";
import { captureException, endSession, flush, init, startCommand } from "./telemetry.js";
import { type ParsedTokenArgs, parseTokenArgs, TokenParseError } from "./token-args.js";
import { checkForUpdates } from "./update-notifier.js";

const resolveCloneToken = createFeatureResolver({ envName: "HOLOCRON_READ_TOKEN", keyringKey: "github.read" });
const resolveSyncToken = createFeatureResolver({ envName: "HOLOCRON_SYNC_TOKEN", keyringKey: "github.sync" });

const { version: CLI_VERSION } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
	version: string;
};

/** Parses --token values and returns the context spread, or null on parse error (exits with code 1). */
function tokenContext(rawTokens: string[] | undefined): ParsedTokenArgs | null {
	if (!rawTokens?.length) return {};
	try {
		return parseTokenArgs(rawTokens);
	} catch (err) {
		if (err instanceof TokenParseError) {
			console.error(`--token: ${err.message}`);
			process.exitCode = 1;
			return null;
		}
		throw err;
	}
}

init(CLI_VERSION);
const updateCheckPromise = checkForUpdates(CLI_VERSION);

let finishCommand: (ok: boolean) => void = () => {};

try {
	await yargs(hideBin(process.argv))
		.middleware((argv) => {
			const name = (argv._ as string[]).slice(0, 2).join(" ") || "unknown";
			finishCommand = startCommand(name);
		})
		.scriptName("")
		.usage("holocron <command> [options]")
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
		.option("cwd", {
			type: "string",
			default: process.cwd(),
			describe: "Directory to search for holocron.config.json",
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
					console.error(`clone: ${err instanceof AuthError ? err.message : String(err)}`);
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
				const report = await runDoctor({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...(argv.repo ? { repo: argv.repo } : {}),
						...tokens,
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
				y.option("repo", {
					type: "string",
					describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
				}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const loaded = await loadConfig(argv.cwd);
				const report = await runSetup({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...(argv.repo ? { repo: argv.repo } : {}),
						...tokens,
					},
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
					.demandCommand(1, "Run `holocron skills --help` to see available skills subcommands."),
			() => {}
		)
		.command(
			"secret set <name> [value]",
			"Set a single secret via the configured `secrets` capability",
			(y) =>
				y
					.positional("name", {
						type: "string",
						demandOption: true,
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
				const scopeArg = argv.scope as string;
				const scope = parseScope(scopeArg);
				const report = await runSecretSet({
					loaded: await loadConfig(argv.cwd),
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...tokens,
					},
					name: argv.name as string,
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
			"secrets sync <environmentId>",
			"Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
			(y) =>
				y
					.positional("environmentId", {
						type: "string",
						demandOption: true,
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
				const loaded = await loadConfig(argv.cwd);
				const report = await runSecretsSync({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...tokens,
					},
					environmentId: argv.environmentId as string,
					...(argv.projectId ? { projectId: argv.projectId } : {}),
					targets: argv.target as Array<"development" | "preview" | "production">,
				});
				if (report.summary.fail > 0) {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"deploy <branch>",
			"Trigger a deployment via the configured `deployment` capability",
			(y) =>
				y
					.positional("branch", {
						type: "string",
						demandOption: true,
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
				const loaded = await loadConfig(argv.cwd);
				const report = await runDeploy({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...tokens,
					},
					projectId: argv.projectId as string,
					branch: argv.branch as string,
					...(argv.target ? { target: argv.target as "production" | "staging" } : {}),
				});
				if (report.status === "fail") {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"npm",
			"npm-related monorepo utilities",
			(y) =>
				y
					.command(
						"bump-versions <new-version>",
						"Bump all non-private package versions in lockstep (semantic-release prepareCmd)",
						(yy) =>
							yy.positional("new-version", {
								type: "string",
								demandOption: true,
								describe: "Version to set (e.g., 4.2.0 or 2.0.0-alpha.1)",
							}),
						async (argv) => {
							const report = await runNpmBumpVersions({
								version: argv.newVersion as string,
								cwd: argv.cwd,
								dryRun: argv.dryRun,
							});
							if (report.status === "fail") {
								process.exitCode = 1;
							}
						}
					)
					.command(
						"publish-initial",
						"One-shot bootstrap publish for trusted-publishing-eligible packages",
						(yy) =>
							yy
								.option("tag", {
									type: "string",
									default: "alpha",
									describe: "npm distribution tag (defaults to alpha)",
								})
								.option("otp", {
									type: "string",
									describe:
										"One-time password from your authenticator (required if npm needs 2FA for writes)",
								}),
						async (argv) => {
							const report = await runNpmPublishInitial({
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
					.demandCommand(1, "Run `holocron npm --help` to see available npm subcommands."),
			() => {}
		)
		.command(
			"sync [steps..]",
			"Sync state from config to the provider and local files (labels, properties, topics, keywords, description)",
			(y) =>
				y
					.positional("steps", {
						type: "string",
						array: true,
						describe: "Steps to run: labels, properties, topics, keywords, description (default: all)",
					})
					.option("repo", {
						type: "string",
						describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
					}),
			async (argv) => {
				const tokens = tokenContext(argv.token);
				if (!tokens) return;
				const loaded = await loadConfig(argv.cwd);
				const report = await runSync({
					loaded,
					context: {
						repoRoot: argv.cwd,
						dryRun: argv.dryRun,
						...(argv.repo ? { repo: argv.repo } : {}),
						...tokens,
					},
					...(argv.steps && argv.steps.length > 0 ? { steps: argv.steps as string[] } : {}),
				});
				if (report.summary.fail > 0) {
					process.exitCode = 1;
				}
			}
		)
		.command(
			"sync-github",
			"Sync workflow templates and composite actions to theholocron/.github via the GitHub API",
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
						console.error(`sync-github: ${err instanceof AuthError ? err.message : String(err)}`);
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
					.option("org", {
						type: "string",
						default: "theholocron",
						describe: "GitHub org that owns the template and will own the new repo",
					})
					.option("verify", {
						type: "boolean",
						default: true,
						describe: "Run pnpm install after bootstrapping (default true; --no-verify skips)",
					}),
			async (argv) => {
				try {
					let type = argv.type as string | undefined;
					let name = argv.name as string | undefined;
					let description = argv.description as string | undefined;

					const needsPrompt = !type || !name || description === undefined;
					if (needsPrompt) {
						const rl = createInterface({ input: stdin, output: stdout });
						const ask = (question: string) =>
							new Promise<string>((resolve) =>
								rl.question(`  ${question} `, (answer) => resolve(answer.trim()))
							);
						try {
							if (!type) {
								console.log("  Known types: base, cli, monorepo, nextjs, node, react");
								type = await ask("Template type:");
							}
							if (!name) name = await ask("Repo name (kebab-case):");
							if (description === undefined) {
								description = await ask("Short description (Enter to skip):");
							}
						} finally {
							rl.close();
						}
					}

					if (!type) {
						console.error("new: template type is required");
						process.exitCode = 1;
						return;
					}
					if (!name) {
						console.error("new: repo name is required");
						process.exitCode = 1;
						return;
					}

					const report = await runNew({
						type,
						name,
						...(description ? { description } : {}),
						org: argv.org,
						dryRun: argv.dryRun,
						noVerify: !argv.verify,
						cwd: argv.cwd,
					});
					if (report.status === "fail") process.exitCode = 1;
				} catch (err) {
					if (err instanceof NewError) {
						console.error(`new: ${err.message}`);
						process.exitCode = 1;
						return;
					}
					throw err;
				}
			}
		)
		.command(
			"plugin create <slug> <vendor>",
			"Scaffold a new @theholocron/holocron-plugin-<slug> package",
			(y) =>
				y
					.positional("slug", { type: "string", demandOption: true, describe: "Package slug (kebab-case)" })
					.positional("vendor", {
						type: "string",
						demandOption: true,
						describe: "Vendor display name (PascalCase)",
					})
					.option("capability", {
						type: "string",
						describe:
							"Capability key: source|ci|secrets|environments|issues|deployment|storage|auth|vault|dns|tooling|notifications|analytics|observability",
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
					const capabilityKeys = Object.keys(CARDINALITY).join(", ");
					const needsPrompt = !argv.capability || !argv.vendorEnv || !argv.baseUrl;

					let capability: CapabilityKey;
					let vendorEnv: string;
					let baseUrl: string;

					if (needsPrompt) {
						const rl = createInterface({ input: stdin, output: stdout });
						const ask = (question: string) =>
							new Promise<string>((resolve) =>
								rl.question(`  ${question} `, (answer) => resolve(answer.trim()))
							);
						try {
							if (!argv.capability) {
								console.log(`  Available capabilities: ${capabilityKeys}`);
								capability = (await ask("Capability:")) as CapabilityKey;
							} else {
								capability = argv.capability as CapabilityKey;
							}
							vendorEnv = argv.vendorEnv
								? (argv.vendorEnv as string)
								: await ask(
										`Vendor-native env var for the ${argv.vendor as string} token (e.g. MYVENDOR_API_KEY):`
									);
							baseUrl = argv.baseUrl
								? (argv.baseUrl as string)
								: await ask(
										`REST base URL for the ${argv.vendor as string} API (e.g. https://api.myvendor.com):`
									);
						} finally {
							rl.close();
						}
					} else {
						capability = argv.capability as CapabilityKey;
						vendorEnv = argv.vendorEnv as string;
						baseUrl = argv.baseUrl as string;
					}

					const report = runPluginCreate({
						slug: argv.slug as string,
						vendorName: argv.vendor as string,
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
						console.error(`plugin create: ${err.message}`);
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
						"node <to>",
						"Scan the repo and update every Node.js version pin to a new major",
						(yy) =>
							yy
								.positional("to", {
									type: "number",
									demandOption: true,
									describe: "Target Node.js major version (e.g., 22)",
								})
								.option("from", {
									type: "number",
									describe:
										"Current major version to replace. Auto-detected from .nvmrc / engines.node when omitted.",
								}),
						async (argv) => {
							// Read upgrade.node.extra from holocron.config.json if present.
							// We read the raw file directly rather than through loadConfig because
							// the upgrade config is not part of the plugin schema.
							let extra: string[] = [];
							try {
								const raw = readFileSync(join(argv.cwd, "holocron.config.json"), "utf8");
								const cfg = JSON.parse(raw) as Record<string, unknown>;
								const upgradeNode = (cfg.upgrade as Record<string, unknown> | undefined)?.node as
									| Record<string, unknown>
									| undefined;
								if (Array.isArray(upgradeNode?.extra)) {
									extra = upgradeNode.extra as string[];
								}
							} catch {
								/* no config or no upgrade section — fine */
							}

							const report = await runUpgradeNode({
								to: argv.to as number,
								...(argv.from != null ? { from: argv.from as number } : {}),
								cwd: argv.cwd,
								dryRun: argv.dryRun,
								extra,
							});
							if (report.status === "fail") {
								if (report.message) console.error(`upgrade node: ${report.message}`);
								process.exitCode = 1;
							}
						}
					)
					.demandCommand(1, "Run `holocron upgrade --help` to see available upgrade subcommands."),
			() => {}
		)
		.command(
			"auth <subcommand>",
			"Manage bootstrap credentials in the OS keyring",
			(y) =>
				y
					.command(
						"set <provider> [value]",
						"Verify + store a bootstrap token for a provider",
						(yy) =>
							yy
								.positional("provider", { type: "string", demandOption: true })
								.positional("value", { type: "string" }),
						async (argv) => {
							const result = await runAuthSet({
								provider: argv.provider as string,
								...(argv.value ? { positional: argv.value as string } : {}),
							});
							if (result.status === "fail") process.exitCode = 1;
						}
					)
					.command(
						"unset <provider>",
						"Remove a stored bootstrap token",
						(yy) => yy.positional("provider", { type: "string", demandOption: true }),
						(argv) => {
							runAuthUnset({ provider: argv.provider as string });
						}
					)
					.command(
						"check <provider>",
						"Re-verify a stored bootstrap token",
						(yy) => yy.positional("provider", { type: "string", demandOption: true }),
						async (argv) => {
							const result = await runAuthCheck({ provider: argv.provider as string });
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
					.demandCommand(1, "Run `holocron auth --help` to see available auth subcommands."),
			() => {}
		)
		.demandCommand(1, "Run `holocron --help` to see available commands.")
		.strict()
		.help()
		.parse();
} catch (err) {
	captureException(err);
	if (!process.exitCode) process.exitCode = 1;
}

finishCommand(!process.exitCode);
endSession();
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
