import type { ErrorSink } from "@theholocron/observability/core";

import type { ErrorReporter } from "./error-reporter.type.js";

/**
 * An {@link ErrorReporter} that makes its sink on the first error and again on the first error after a flush.
 * `SentrySink.flush()` closes the Sentry client, and Vercel keeps a function instance warm for later deliveries, so a
 * sink made once at load would drop every error after the first flush. Nothing is initialised for a delivery that
 * raises none.
 *
 * @param makeSink - Builds an initialised sink (`resolveErrorSink()` over the environment).
 * @returns The reporter.
 */
export function createErrorReporter(makeSink: () => ErrorSink): ErrorReporter {
	let sink: ErrorSink | undefined;
	return {
		capture(err) {
			try {
				sink ??= makeSink();
				sink.captureException(err);
			} catch (failure) {
				console.error("error reporter: could not report an error", failure);
			}
		},
		async flush() {
			const pending = sink;
			sink = undefined;
			try {
				await pending?.flush();
			} catch (failure) {
				console.error("error reporter: flush failed", failure);
			}
		},
	};
}
