/**
 * `@theholocron/observability/testing` — vitest-based test doubles for the
 * `/core` interfaces (`Logger`, `ErrorSink`, `AnalyticsSink`). Every consumer
 * that tests code which logs or reports telemetry wants these — hand-rolling
 * the same spy shape per repo is what this subpath replaces.
 *
 * `vitest` is an optional peer dependency: install it alongside this
 * subpath (any repo with a vitest suite already has it as a devDependency).
 * For a non-vitest context that needs a `Logger` but no output, use
 * {@link NoopLogger} from `/core` instead — it records nothing to assert on.
 */

export type { FakeAnalyticsSink } from "./testing/fake-analytics-sink.js";
export { fakeAnalyticsSink } from "./testing/fake-analytics-sink.js";
export type { FakeErrorSink, FakeSpan } from "./testing/fake-error-sink.js";
export { fakeErrorSink } from "./testing/fake-error-sink.js";
export type { FakeLogger } from "./testing/fake-logger.js";
export { fakeLogger } from "./testing/fake-logger.js";
