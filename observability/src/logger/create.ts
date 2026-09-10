import type { Logger, LogLevel } from "../core/logger.js";
import { detectEnv, generateRunId, isCI, isTelemetryDisabled, resolveAxiomFromEnv, resolveLevel } from "./context.js";
import { createPinoInstance, PinoLogger } from "./pino.js";
import type { AxiomTransportConfig } from "./transports.js";

export interface LoggerConfig {
	/**
	 * Explicit level — the highest-priority source. The caller passes the
	 * resolved `--verbose` / `--quiet` flag or a config field here. Falls
	 * through to `HOLOCRON_LOG_LEVEL`, then `"info"`.
	 */
	level?: LogLevel;
	/**
	 * Axiom credentials. Resolved from env vars by default
	 * (`HOLOCRON_AXIOM_TOKEN` / `AXIOM_TOKEN` + `HOLOCRON_AXIOM_DATASET` /
	 * `AXIOM_DATASET`). Pass this only to override — e.g. to pair an OS-keyring
	 * token with a config-file dataset. The **token** must never come from a
	 * committed config file. The transport is also skipped entirely when
	 * `HOLOCRON_TELEMETRY=false`.
	 */
	axiom?: AxiomTransportConfig;
}

export interface CreateLoggerResult {
	/** The logger to thread through modules via `child()`. */
	logger: Logger;
	/**
	 * Correlation id bound to every line this logger (and its children) emit.
	 * Surface it to the user (e.g. on `--debug`) so they can pull the run out
	 * of Axiom.
	 */
	runId: string;
}

/**
 * The single entry point for building a Pino-backed logger. Generates a
 * `runId`, detects the environment, resolves the level, wires the right
 * transports, and returns a ready {@link Logger}.
 *
 * ```ts
 * const { logger, runId } = createLogger({ level, axiom });
 * const log = logger.child({ command: "sync-github", repo });
 * log.info({ branch }, "opening PR");
 * ```
 *
 * For a browser / edge / React Native context, construct a `ConsoleLogger`
 * directly instead — it needs no `createLogger`.
 */
export function createLogger(config: LoggerConfig = {}): CreateLoggerResult {
	const runId = generateRunId();
	const env = detectEnv();
	const level = resolveLevel(config.level);
	const axiom = config.axiom ?? resolveAxiomFromEnv();

	const instance = createPinoInstance({
		level,
		axiom,
		ci: isCI(),
		tty: Boolean(process.stdout.isTTY),
		telemetryDisabled: isTelemetryDisabled(),
		base: { runId, env },
	});

	return { logger: new PinoLogger(instance), runId };
}
