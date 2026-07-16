import { readFileSync } from "node:fs";
import { join } from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import type { CapabilityKey } from "./capabilities/index.js";
import { runAuthCheck, runAuthList, runAuthSet, runAuthUnset } from "./commands/auth.js";
import { runDeploy } from "./commands/deploy.js";
import { runDoctor } from "./commands/doctor.js";
import { runNpmBumpVersions } from "./commands/npm-bump-versions.js";
import { runUpgradeNode } from "./commands/upgrade-node.js";
import { runSyncGithub } from "./commands/sync-github.js";
import { runNpmPublishInitial } from "./commands/npm-publish-initial.js";
import { PluginCreateError, runPluginCreate } from "./commands/plugin-create/index.js";
import { runSecretSet } from "./commands/secret-set.js";
import { runSecretsSync } from "./commands/secrets-sync.js";
import { runSetup } from "./commands/setup.js";
import { runSync } from "./commands/sync.js";
import { loadConfig } from "./load-config.js";

const { version: CLI_VERSION } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
	version: string;
};

await yargs(hideBin(process.argv))
	.scriptName("holocron")
	.usage("$0 <command> [options]")
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
		describe:
			"Vendor token passed to plugins as `cliToken`, taking precedence over env vars. " +
			"Unambiguous for single-plugin commands; for multi-plugin flows pass per-vendor env vars instead.",
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
		"doctor",
		"Load the config and run a smoke check against every provider",
		(y) =>
			y.option("repo", {
				type: "string",
				describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
			}),
		async (argv) => {
			const loaded = await loadConfig(argv.cwd);
			const report = await runDoctor({
				loaded,
				context: {
					repoRoot: argv.cwd,
					dryRun: argv.dryRun,
					...(argv.repo ? { repo: argv.repo } : {}),
					...(argv.token ? { cliToken: argv.token } : {}),
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
			const loaded = await loadConfig(argv.cwd);
			const report = await runSetup({
				loaded,
				context: {
					repoRoot: argv.cwd,
					dryRun: argv.dryRun,
					...(argv.repo ? { repo: argv.repo } : {}),
					...(argv.token ? { cliToken: argv.token } : {}),
				},
			});
			if (report.summary.fail > 0) {
				process.exitCode = 1;
			}
		}
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
			const scopeArg = argv.scope as string;
			const scope = parseScope(scopeArg);
			const report = await runSecretSet({
				loaded: await loadConfig(argv.cwd),
				context: {
					repoRoot: argv.cwd,
					dryRun: argv.dryRun,
					...(argv.token ? { cliToken: argv.token } : {}),
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
			const loaded = await loadConfig(argv.cwd);
			const report = await runSecretsSync({
				loaded,
				context: {
					repoRoot: argv.cwd,
					dryRun: argv.dryRun,
					...(argv.token ? { cliToken: argv.token } : {}),
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
			const loaded = await loadConfig(argv.cwd);
			const report = await runDeploy({
				loaded,
				context: {
					repoRoot: argv.cwd,
					dryRun: argv.dryRun,
					...(argv.token ? { cliToken: argv.token } : {}),
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
		"Sync source-level state (labels, properties, topics) from config to the provider",
		(y) =>
			y
				.positional("steps", {
					type: "string",
					array: true,
					describe: "Steps to run: labels, properties, topics (default: all)",
				})
				.option("repo", {
					type: "string",
					describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
				}),
		async (argv) => {
			const loaded = await loadConfig(argv.cwd);
			const report = await runSync({
				loaded,
				context: {
					repoRoot: argv.cwd,
					dryRun: argv.dryRun,
					...(argv.repo ? { repo: argv.repo } : {}),
					...(argv.token ? { cliToken: argv.token } : {}),
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
			const token = outputDir
				? "no-token-needed"
				: (argv.token ?? process.env.GITHUB_TOKEN ?? process.env.HOLOCRON_GITHUB_TOKEN);
			if (!token) {
				console.error("sync-github: GitHub token required — pass --token or set GITHUB_TOKEN");
				process.exitCode = 1;
				return;
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
		(argv) => {
			try {
				if (!argv.capability || !argv.vendorEnv || !argv.baseUrl) {
					throw new PluginCreateError(
						"Phase A: --capability, --vendor-env, and --base-url are required. " +
							"Interactive prompts land in Phase B."
					);
				}
				const report = runPluginCreate({
					slug: argv.slug as string,
					vendorName: argv.vendor as string,
					capability: argv.capability as CapabilityKey,
					vendorEnv: argv.vendorEnv as string,
					baseUrl: argv.baseUrl as string,
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
					"set <provider> [token]",
					"Verify + store a bootstrap token for a provider",
					(yy) =>
						yy
							.positional("provider", { type: "string", demandOption: true })
							.positional("token", { type: "string" }),
					async (argv) => {
						const result = await runAuthSet({
							provider: argv.provider as string,
							...(argv.token ? { positional: argv.token as string } : {}),
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
