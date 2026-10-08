/**
 * CLI-side wiring for `@theholocron/observability/logger`.
 *
 * `logger` is the operational-output channel — internal state, debug
 * traces, errors, structured context that routes to Axiom. It runs in
 * parallel to `print` (user-facing UX output) and does not replace it.
 */

import type { Logger, LogLevel } from "@theholocron/observability/core";
import type { AxiomTransportConfig } from "@theholocron/observability/logger";
import { createLogger, isCI, parseLogLevel, resolveAxiomFromEnv } from "@theholocron/observability/logger";

import { getToken } from "./auth/keyring.js";
import { env } from "./env.js";
import { style } from "./ui/style.js";

/**
 * Resolve the explicit level to hand to `createLogger`, in priority order:
 *
 * 1. `--log <level>`           2. `--verbose` → `"debug"`   3. `--quiet` → `"error"`
 * 4. `HOLOCRON_LOG_LEVEL` env var
 * 5. `holocron.config` `log.level` (`configLevel`)
 *
 * Returns `undefined` when nothing applies — `createLogger` then defaults
 * to `"info"`. Resolving the full chain here (rather than passing
 * `configLevel` straight through) keeps config below the env var.
 */
export function resolveLogLevel(
	argv: { verbose?: boolean; quiet?: boolean; log?: LogLevel },
	configLevel?: LogLevel
): LogLevel | undefined {
	if (argv.log) return argv.log;
	if (argv.verbose) return "debug";
	if (argv.quiet) return "error";
	return parseLogLevel(env.get("HOLOCRON_LOG_LEVEL")) ?? configLevel;
}

/**
 * Resolve whether human-visible console output (pretty or NDJSON) should run
 * at all, independent of level — the `@theholocron/observability`
 * `consoleOutput` override.
 *
 * Local/interactive runs are quiet by default: any raw structured logger
 * output (colorized or not) stays off regardless of the resolved level,
 * unless the user explicitly asked to see it via `--log <level>`,
 * `--verbose`, or `--quiet`. CI is untouched either way — returning
 * `undefined` there preserves `createLogger`'s own `ci`/`tty`
 * auto-detection exactly, so CI's existing NDJSON-to-stdout behavior is
 * unaffected by this flag.
 */
export function resolveConsoleOutput(argv: {
	verbose?: boolean;
	quiet?: boolean;
	log?: LogLevel;
}): boolean | undefined {
	if (argv.log || argv.verbose || argv.quiet) return true;
	return isCI() ? undefined : false;
}

let root: { logger: Logger; runId: string } | undefined;
let rootLevel: LogLevel | undefined;
let rootCommand: string | undefined;
let rootAxiomKey: string | undefined;

export interface BuildCliLoggerOpts {
	/** Active command name — bound on the root as `command` for every line. */
	command?: string;
	/** `holocron.config` `log.level`, from a handler that has loaded a config. */
	configLevel?: LogLevel;
	/**
	 * `holocron.config` `log.axiom.dataset` — the non-secret Axiom dataset
	 * name. Paired with a keyring token when the env vars are absent.
	 */
	configAxiomDataset?: string;
	/**
	 * Resolved org (`--org` → `HOLOCRON_ORG` → config `org`) for the
	 * namespaced keyring lookup (`axiom.<org>` before bare `axiom`).
	 */
	org?: string;
}

/**
 * Resolve Axiom credentials for the CLI. Env vars win — same contract as
 * `@theholocron/observability`'s `resolveAxiomFromEnv`. Failing that, the CLI-only
 * bridge pairs the OS-keyring token (`axiom.<org>` then bare `axiom`) with a
 * dataset from `HOLOCRON_AXIOM_DATASET` / `AXIOM_DATASET` or
 * `holocron.config` `log.axiom.dataset`. Returns `undefined` unless both a
 * token and a dataset are found.
 */
function resolveCliAxiom(opts: BuildCliLoggerOpts): AxiomTransportConfig | undefined {
	const fromEnv = resolveAxiomFromEnv();
	if (fromEnv) return fromEnv;

	const dataset = env.get("HOLOCRON_AXIOM_DATASET") || env.get("AXIOM_DATASET") || opts.configAxiomDataset;
	if (!dataset) return undefined;

	const org = opts.org ?? env.get("HOLOCRON_ORG");
	const token = (org ? getToken(`axiom.${org}`) : null) ?? getToken("axiom");
	return token ? { dataset, token } : undefined;
}

/**
 * The process-wide root logger. Built once (from `cli.ts`'s middleware,
 * with the command name + flags + env). Rebuilt at most once more when a
 * command's handler supplies `holocron.config` context the flag/env-only
 * first pass could not have known — `log.level` (unless `--verbose` /
 * `--quiet` already fixed it) or `log.axiom.dataset` + the resolved org
 * for a keyring-backed Axiom transport. That rebuild generates a fresh
 * `runId`, which is harmless: nothing logs between the middleware and the
 * handler.
 */
export function buildCliLogger(
	argv: { verbose?: boolean; quiet?: boolean; log?: LogLevel },
	opts: BuildCliLoggerOpts = {}
): { logger: Logger; runId: string } {
	const { command, configLevel } = opts;
	if (command) rootCommand = command;
	const level = resolveLogLevel(argv, configLevel);
	const consoleOutput = resolveConsoleOutput(argv);
	const axiom = resolveCliAxiom(opts);
	const axiomKey = axiom?.dataset;
	const rebuildForConfig =
		configLevel !== undefined && level !== rootLevel && !argv.verbose && !argv.quiet && !argv.log;
	const rebuildForAxiom = axiomKey !== undefined && axiomKey !== rootAxiomKey;
	if (!root || rebuildForConfig || rebuildForAxiom) {
		const built = createLogger({
			...(level ? { level } : {}),
			...(axiom ? { axiom } : {}),
			...(consoleOutput !== undefined ? { consoleOutput } : {}),
		});
		root = {
			logger: rootCommand ? built.logger.child({ command: rootCommand }) : built.logger,
			runId: built.runId,
		};
		rootLevel = level;
		rootAxiomKey = axiomKey;
	}
	return root;
}

/**
 * Lazily-memoized `Logger` for module-level call sites with no `argv` in
 * scope — notably yargs' own `.fail()` handler, which fires on a
 * pre-middleware validation failure (a missing required argument, an
 * unknown command) and therefore runs before `buildCliLogger` has ever
 * built the real root. Without an explicit `consoleOutput` here, that
 * fallback would use `createLogger`'s bare auto-detection (pretty on any
 * local TTY) and leak a structured block even though no flag asked for one
 * — so it resolves the same "quiet unless CI" default `buildCliLogger`
 * would, as if no flags were passed.
 */
export function getLogger(): Logger {
	return (root ??= createLogger({ consoleOutput: resolveConsoleOutput({}) })).logger;
}

/**
 * Report a fatal, command-ending CLI error: always printed to the console
 * (regardless of `consoleOutput` suppression) via `style.fail`, and also
 * sent through the structured logger for Axiom/telemetry visibility.
 *
 * Use this when a handler is returning or exiting right here with nothing
 * else for the user to see — a resolved `--token` failure, a yargs
 * validation failure, a thrown domain error. Don't use it for a per-step
 * warning inside a multi-step orchestrator that already prints its own
 * `ok / fail / skip` summary — that summary is the user-facing signal;
 * the per-step reason belongs in the structured log alone.
 */
export function reportError(message: string, log: Logger = getLogger()): void {
	console.error(style.fail(message));
	log.error(message);
}

/** The current root logger's correlation id, if a root has been built. */
export function getRunId(): string | undefined {
	return root?.runId;
}

/** Test hook — drop the memoized root so the next call rebuilds it. */
export function resetCliLogger(): void {
	root = undefined;
	rootLevel = undefined;
	rootCommand = undefined;
	rootAxiomKey = undefined;
}
