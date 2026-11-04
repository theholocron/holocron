/**
 * `@theholocron/observability` — the whole surface in one import.
 *
 * Prefer a subpath (`@theholocron/observability/core`, `/logger`, `/errors`,
 * `/analytics`) so a browser or edge bundle only pulls what it uses and the
 * optional peer dependencies stay optional. The root export is the convenience
 * form for a Node process that wants all of it.
 */

// core — interfaces, no-ops, redaction (zero-dependency)
export * from "./core.js";

// logger
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

// errors
export { scrubError, SentrySink } from "./errors/sentry-sink.js";

// analytics
export { PostHogSink } from "./analytics/posthog-sink.js";
