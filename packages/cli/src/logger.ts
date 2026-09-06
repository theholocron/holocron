/**
 * CLI-side wiring for `@theholocron/logger`.
 *
 * `logger` is the operational-output channel — internal state, debug
 * traces, errors, structured context that routes to Axiom. It runs in
 * parallel to `print` (user-facing UX output) and does not replace it.
 */

import { createLogger, type Logger, type LogLevel, parseLogLevel } from "@theholocron/logger";

import { env } from "./env.js";

/**
 * Resolve the explicit level to hand to `createLogger`, in priority order:
 *
 * 1. `--verbose` → `"debug"`   2. `--quiet` → `"error"`
 * 3. `HOLOCRON_LOG_LEVEL` env var
 * 4. `holocron.config` `log.level` (`configLevel`)
 *
 * Returns `undefined` when nothing applies — `createLogger` then defaults
 * to `"info"`. Resolving the full chain here (rather than passing
 * `configLevel` straight through) keeps config below the env var.
 */
export function resolveLogLevel(
	argv: { verbose?: boolean; quiet?: boolean },
	configLevel?: LogLevel
): LogLevel | undefined {
	if (argv.verbose) return "debug";
	if (argv.quiet) return "error";
	return parseLogLevel(env.get("HOLOCRON_LOG_LEVEL")) ?? configLevel;
}

let root: { logger: Logger; runId: string } | undefined;
let rootLevel: LogLevel | undefined;
let rootCommand: string | undefined;

export interface BuildCliLoggerOpts {
	/** Active command name — bound on the root as `command` for every line. */
	command?: string;
	/** `holocron.config` `log.level`, from a handler that has loaded a config. */
	configLevel?: LogLevel;
}

/**
 * The process-wide root logger. Built once (from `cli.ts`'s middleware,
 * with the command name + flags + env). Rebuilt at most once more when a
 * command's handler supplies its `holocron.config` `log.level` — a case
 * the flag/env-only first pass could not have known — as long as no
 * higher-priority `--verbose` / `--quiet` already fixed the level. That
 * rebuild generates a fresh `runId`, which is harmless: nothing logs
 * between the middleware and the handler.
 */
export function buildCliLogger(
	argv: { verbose?: boolean; quiet?: boolean },
	opts: BuildCliLoggerOpts = {}
): { logger: Logger; runId: string } {
	const { command, configLevel } = opts;
	if (command) rootCommand = command;
	const level = resolveLogLevel(argv, configLevel);
	const rebuildForConfig = configLevel !== undefined && level !== rootLevel && !argv.verbose && !argv.quiet;
	if (!root || rebuildForConfig) {
		const built = createLogger(level ? { level } : {});
		root = {
			logger: rootCommand ? built.logger.child({ command: rootCommand }) : built.logger,
			runId: built.runId,
		};
		rootLevel = level;
	}
	return root;
}

/** Lazily-memoized `Logger` for module-level call sites with no `argv` in scope. */
export function getLogger(): Logger {
	return (root ??= createLogger()).logger;
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
}
