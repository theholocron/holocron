/**
 * `@theholocron/observability/core` — the zero-dependency heart of the library.
 *
 * Interfaces ({@link Logger}, {@link ErrorSink}, {@link AnalyticsSink}), their
 * no-op implementations, and the redaction helpers. Nothing here imports a
 * vendor SDK or a Node built-in beyond what a browser / edge / React Native
 * bundle tolerates, so application and library code can depend on `/core`
 * everywhere; only the process entry point pulls a concrete adapter subpath.
 */

export type { LogEnv, Logger, LogLevel } from "./core/logger.js";
export { LOG_LEVELS } from "./core/logger.js";
export { redact, REDACT_CENSOR, REDACTED_PATHS, redactObject, redactOptions } from "./core/redact.js";
export type { AnalyticsSink, CommandSpan, ErrorSink } from "./core/sinks.js";
export { NoopAnalyticsSink, NoopErrorSink } from "./core/sinks.js";
