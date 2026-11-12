import { homedir } from "node:os";
import { join } from "node:path";

import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { onRetry } from "@theholocron/http-client";
import { addGlobalOptions } from "@theholocron/kyber/flags";
import { checkForUpdates } from "@theholocron/kyber/notifier";
import { commandFailureMessage, createRetryNotice, setProgressListener } from "@theholocron/kyber/ui";
import { LOG_LEVELS } from "@theholocron/observability/core";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { applyCommand } from "../commands/apply/index.js";
import { checkCommand } from "../commands/check/index.js";
import { cleanupCommand } from "../commands/cleanup/index.js";
import { cloneCommand } from "../commands/clone/clone.command.js";
import { configShowCommand } from "../commands/config-show/index.js";
import { commandsInContext } from "../commands/contexts/index.js";
import { deployCommand } from "../commands/deploy/deploy.command.js";
import { devCommand } from "../commands/dev/index.js";
import { doctorCommand } from "../commands/doctor/index.js";
import { exportCommand } from "../commands/export/index.js";
import { listCommand } from "../commands/list/index.js";
import { menuCommand } from "../commands/menu/menu.command.js";
import { migrateCommand } from "../commands/migrate/index.js";
import { newCommand } from "../commands/new/new.command.js";
import { notificationsCommand } from "../commands/notifications/notifications.command.js";
import { probeCommand } from "../commands/probe/index.js";
import { projectCommand } from "../commands/project/index.js";
import { providerCommand } from "../commands/provider/index.js";
import { publishCommand } from "../commands/publish/publish.command.js";
import { removeCommand } from "../commands/remove/index.js";
import { resolveCommand } from "../commands/resolve/index.js";
import { runCommand } from "../commands/run/run.command.js";
import { setupCommand } from "../commands/setup/setup.command.js";
import { skillsCommand } from "../commands/skills/index.js";
import { syncCommand } from "../commands/sync/sync.command.js";
import { upgradeCommand } from "../commands/upgrade/index.js";
import { buildCliLogger, getRunId, reportError } from "../observability/logger/index.js";
import { captureException, endSession, flush, init, startCommand } from "../observability/telemetry/index.js";
import { ownPackageJson } from "./own-package-json.js";

const env = createEnvLookup();

const { name: CLI_PACKAGE_NAME, version: CLI_VERSION } = ownPackageJson(import.meta.url);

/**
 * Error class names whose `.message` is a complete, actionable sentence: printed on its own, with no usage dump and no
 * stack trace. Any other error is printed too, so a command that throws a plain `Error` is never silent.
 */
const USER_FACING_ERRORS = new Set(["WorkspaceContextError", "ConfigFileError", "NonInteractiveError"]);

/** Whether to print the correlation id at command end (`--debug` / `--verbose`). */
let printRunId = false;

init(CLI_VERSION);
setProgressListener(createRetryNotice(onRetry));
// The answer is kept in `HOLOCRON_CACHE_DIR`, `~/.cache/holocron` by default.
const updateCheckPromise = checkForUpdates({
	name: CLI_PACKAGE_NAME,
	currentVersion: CLI_VERSION,
	cacheDir: env.get("HOLOCRON_CACHE_DIR") ?? join(homedir(), ".cache", "holocron"),
	env: { CI: env.get("CI"), NO_UPDATE_NOTIFIER: env.get("NO_UPDATE_NOTIFIER") },
});

let finishCommand: (ok: boolean) => void = () => {};
/** Set by `.fail()` once it has printed an error, so the outer catch doesn't repeat it. */
let errorReported = false;

try {
	await addGlobalOptions(
		yargs(hideBin(process.argv))
			.scriptName("")
			.usage("holocron <command> [options]")
			.version(CLI_VERSION)
			.alias("version", "v")
			// Keep everything after `--` in `argv['--']` instead of folding it into
			// `argv._`. `holocron run <task> [job] -- <args>` forwards `<args>` to the
			// underlying tool (`lhci autorun --config=…`, `turbo run build -- …`); the
			// telemetry command name reads `argv._` and must not pick these up.
			.parserConfiguration({ "populate--": true }),
		{
			describe: {
				dryRun:
					"Print what would be mutated without calling capability mutators. " +
					"Commands branch on this; read-only commands ignore it.",
				token:
					"Vendor token override for plugins. " +
					"Bare form: --token <value> (fallback for all plugins, single-plugin commands). " +
					"Keyed form: --token vendor=value (targets a specific provider; repeat for each). " +
					"Example: --token github=ghp_xxx --token vercel=v_yyy",
				cwd: "Directory to search for holocron.config.json",
			},
		}
	)
		// ── holocron's own global options (--dry-run, --token and --cwd are declared above) ──
		.option("skip-dry-run", {
			type: "boolean",
			default: false,
			describe:
				"Interactive mode only: skip the automatic dry-run preview for a " +
				"dry-run-capable command and run for real immediately.",
		})
		.option("org", {
			type: "string",
			describe:
				"Active org name for namespaced keyring lookup. " +
				"Overrides HOLOCRON_ORG env var and the `org` field in holocron.config.ts. " +
				"Example: --org theholocron",
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
		.command(checkCommand as never)
		.command(exportCommand as never)
		.command(menuCommand(CLI_VERSION) as never)
		.command(setupCommand as never)
		.command(upgradeCommand as never)
		.command(cleanupCommand as never)
		.command(applyCommand as never)
		.command(newCommand as never)
		.command(listCommand as never)
		.command(removeCommand as never)
		.command(probeCommand as never)
		.command(providerCommand as never)
		.command(notificationsCommand as never)
		.command(projectCommand as never)
		.command(migrateCommand as never)
		.command(devCommand as never)
		.command(syncCommand as never)
		.command(publishCommand as never)
		.command(deployCommand as never)
		.command(resolveCommand as never)
		.command(projectCommand as never)
		.strict()
		.help()
		.epilogue(
			"Execution contexts:\n" +
				`  global      works from a bare 'npm i -g': ${commandsInContext("global").join(", ")}\n` +
				`  repo-aware  needs ./holocron.config in cwd: ${commandsInContext("repo-aware").join(", ")}\n` +
				`  workspace   also needs the plugin packages: ${commandsInContext("workspace").join(", ")}\n` +
				"  https://docs.theholocron.dev/holocron/execution-contexts"
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
