/**
 * `@theholocron/observability/logger` — structured logging.
 *
 * `createLogger()` returns a Pino-backed {@link Logger} with pino-pretty
 * locally, NDJSON in CI, and an Axiom transport when credentials resolve
 * (ADR-0007). `ConsoleLogger` is the zero-dependency alternative for the
 * browser / edge / React Native, behind the same interface.
 *
 * `pino`, `pino-pretty` and `@axiomhq/pino` are optional peer dependencies —
 * install them alongside this subpath. The {@link Logger} interface itself
 * lives in `/core` and needs none of them.
 */

export type { LogEnv, Logger, LogLevel } from "./core/logger.js";
export { LOG_LEVELS } from "./core/logger.js";
export { ConsoleLogger } from "./logger/console.js";
export {
	detectEnv,
	generateRunId,
	isCI,
	isTelemetryDisabled,
	parseLogLevel,
	resolveAxiomFromEnv,
	resolveLevel,
} from "./logger/context.js";
export type { CreateLoggerResult, LoggerConfig } from "./logger/create.js";
export { createLogger } from "./logger/create.js";
export { buildPinoOptions, createPinoInstance, type CreatePinoInstanceInput, PinoLogger } from "./logger/pino.js";
export type { AxiomTransportConfig, BuildTransportInput } from "./logger/transports.js";
export { buildTransport } from "./logger/transports.js";
