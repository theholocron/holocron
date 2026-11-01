import { readFileSync } from "node:fs";

import { LOG_LEVELS } from "@theholocron/observability/core";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { authCommand } from "./commands/auth/auth.command.js";
import { cloneCommand } from "./commands/clone/clone.command.js";
import { configShowCommand } from "./commands/config-show/index.js";
import { commandsInContext } from "./commands/contexts/index.js";
import { deployCommand } from "./commands/deploy/deploy.command.js";
import { doctorCommand } from "./commands/doctor/index.js";
import { menuCommand } from "./commands/menu/menu.command.js";
import { monitoringCommand } from "./commands/monitoring/monitoring.command.js";
import { newCommand } from "./commands/new/new.command.js";
import { notificationsCommand } from "./commands/notifications/notifications.command.js";
import { packageCommand } from "./commands/package/package.command.js";
import { probeCommand } from "./commands/probe/index.js";
import { repoCommand } from "./commands/repo/repo.command.js";
import { runCommand } from "./commands/run/run.command.js";
import { secretsCommand } from "./commands/secrets/secrets.command.js";
import { skillsCommand } from "./commands/skills/index.js";
import { specsCommand } from "./commands/specs/specs.command.js";
import { syncCommand } from "./commands/sync/sync.command.js";
import { buildCliLogger, getRunId, reportError } from "./observability/logger/index.js";
import { captureException, endSession, flush, init, startCommand } from "./observability/telemetry/index.js";
import { commandFailureMessage, USER_FACING_ERRORS } from "./ui/command-failure/index.js";
import { checkForUpdates } from "./update-notifier/index.js";

const { version: CLI_VERSION } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
	version: string;
};

/** Whether to print the correlation id at command end (`--debug` / `--verbose`). */
let printRunId = false;

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
		.command(menuCommand(CLI_VERSION) as never)
		.command(repoCommand as never)
		.command(newCommand as never)
		.command(probeCommand as never)
		.command(secretsCommand as never)
		.command(notificationsCommand as never)
		.command(specsCommand as never)
		.command(syncCommand as never)
		.command(packageCommand as never)
		.command(deployCommand as never)
		.command(monitoringCommand as never)
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
