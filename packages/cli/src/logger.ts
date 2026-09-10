/**
 * CLI-side wiring for `@theholocron/observability/logger`.
 *
 * `logger` is the operational-output channel — internal state, debug
 * traces, errors, structured context that routes to Axiom. It runs in
 * parallel to `print` (user-facing UX output) and does not replace it.
 */

import type { Logger, LogLevel } from "@theholocron/observability/core";
import type { AxiomTransportConfig } from "@theholocron/observability/logger";
import { createLogger, parseLogLevel, resolveAxiomFromEnv } from "@theholocron/observability/logger";

import { getToken } from "./auth/keyring.js";
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
	argv: { verbose?: boolean; quiet?: boolean },
	opts: BuildCliLoggerOpts = {}
): { logger: Logger; runId: string } {
	const { command, configLevel } = opts;
	if (command) rootCommand = command;
	const level = resolveLogLevel(argv, configLevel);
	const axiom = resolveCliAxiom(opts);
	const axiomKey = axiom?.dataset;
	const rebuildForConfig = configLevel !== undefined && level !== rootLevel && !argv.verbose && !argv.quiet;
	const rebuildForAxiom = axiomKey !== undefined && axiomKey !== rootAxiomKey;
	if (!root || rebuildForConfig || rebuildForAxiom) {
		const built = createLogger({ ...(level ? { level } : {}), ...(axiom ? { axiom } : {}) });
		root = {
			logger: rootCommand ? built.logger.child({ command: rootCommand }) : built.logger,
			runId: built.runId,
		};
		rootLevel = level;
		rootAxiomKey = axiomKey;
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
	rootAxiomKey = undefined;
}
