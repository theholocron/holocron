import type { Logger, LogLevel } from "@theholocron/observability/core";
import type { AxiomTransportConfig } from "@theholocron/observability/logger";

/** The global logging flags a CLI parses (`--log`, `--verbose`, `--quiet`). */
export interface LogFlags {
	verbose?: boolean;
	quiet?: boolean;
	log?: LogLevel;
}

/** What a handler can supply once the CLI's config file is loaded. */
export interface BuildCliLoggerOpts {
	/** Active command name, bound on the root as `command` for every line. */
	command?: string;
	/** The config file's log level, from a handler that has loaded a config. */
	configLevel?: LogLevel;
	/** The config file's non-secret Axiom dataset name. */
	configAxiomDataset?: string;
	/** The resolved org, for a namespaced credential lookup. */
	org?: string;
}

/** The command name in effect, resolved for {@link CreateCliLoggerOptions.resolveAxiom}. */
export interface CliLoggerContext {
	/** `opts.command`, else the command name remembered from an earlier build. */
	command: string | undefined;
}

export interface CreateCliLoggerOptions {
	/** Upper-case env prefix of the CLI, e.g. `"HOLOCRON"` (reads `<PREFIX>_LOG_LEVEL`). */
	envPrefix: string;
	/**
	 * Resolve Axiom credentials for a build. Defaults to the package's
	 * `resolveAxiomFromEnv`. Return `undefined` to ship nowhere.
	 */
	resolveAxiom?: (opts: BuildCliLoggerOpts, ctx: CliLoggerContext) => AxiomTransportConfig | undefined;
}

/** The bound logging functions a CLI re-exports. */
export interface CliLogger {
	/**
	 * Build (or return the memoized) process-wide root logger. Rebuilt at most
	 * once more when a handler supplies config the flag/env-only first pass could
	 * not have known (the level, or a new Axiom dataset).
	 */
	buildCliLogger: (argv: LogFlags, opts?: BuildCliLoggerOpts) => { logger: Logger; runId: string };
	/** Lazily-memoized root `Logger` for call sites with no `argv` in scope. */
	getLogger: () => Logger;
	/** Print a fatal error with `style.fail` and also log it at error level. */
	reportError: (message: string, log?: Logger) => void;
	/** The current root logger's correlation id, if a root has been built. */
	getRunId: () => string | undefined;
	/** Test hook: drop the memoized root so the next call rebuilds it. */
	resetCliLogger: () => void;
	/** {@link resolveLogLevel} bound to this CLI's env prefix. */
	resolveLogLevel: (argv: LogFlags, configLevel?: LogLevel) => LogLevel | undefined;
}
