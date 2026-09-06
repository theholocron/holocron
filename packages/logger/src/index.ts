import { detectEnv, generateRunId, isCI, isTelemetryDisabled, resolveAxiomFromEnv, resolveLevel } from "./context.js";
import type { Logger, LogLevel } from "./interface.js";
import { createPinoInstance, PinoLogger } from "./pino.js";
import type { AxiomTransportConfig } from "./transports.js";

export {
	detectEnv,
	generateRunId,
	isCI,
	isTelemetryDisabled,
	parseLogLevel,
	resolveAxiomFromEnv,
	resolveLevel,
} from "./context.js";
export type { LogEnv, Logger, LogLevel } from "./interface.js";
export { LOG_LEVELS } from "./interface.js";
export { REDACT_CENSOR, REDACTED_PATHS } from "./redact.js";
export type { AxiomTransportConfig } from "./transports.js";

export interface LoggerConfig {
	/**
	 * Explicit level — the highest-priority source. The command layer passes
	 * the resolved `--verbose` / `--quiet` flag or `holocron.config`
	 * `log.level` here. Falls through to `HOLOCRON_LOG_LEVEL`, then `"info"`.
	 */
	level?: LogLevel;
	/**
	 * Axiom credentials. Resolved from env vars by default
	 * (`HOLOCRON_AXIOM_TOKEN` / `AXIOM_TOKEN` + `HOLOCRON_AXIOM_DATASET` /
	 * `AXIOM_DATASET`). Pass this only to override — e.g. `@theholocron/cli`
	 * pairs an OS-keyring token with a `holocron.config` dataset. The
	 * **token** must never come from a committed config file. The transport
	 * is also skipped entirely when `HOLOCRON_TELEMETRY=false`.
	 */
	axiom?: AxiomTransportConfig;
}

export interface CreateLoggerResult {
	/** The logger to thread through commands and modules via `child()`. */
	logger: Logger;
	/**
	 * Correlation id bound to every line this logger (and its children) emit.
	 * Surface it to the user via `print` when `--debug` or `--verbose` is set
	 * so they can pull the run out of Axiom.
	 */
	runId: string;
}

/**
 * The single entry point for building a logger. Generates a `runId`, detects
 * the environment, resolves the level, wires the right transports, and
 * returns a ready {@link Logger}.
 *
 * ```ts
 * const { logger, runId } = createLogger({ level, axiom });
 * const log = logger.child({ command: "sync-github", repo });
 * log.info({ branch }, "opening PR");
 * ```
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
