import type { ErrorSink } from "@theholocron/observability/core";

import type { ErrorReporter } from "./error-reporter.type.js";

/**
 * An {@link ErrorReporter} that makes its sink on the first error and again on the first error after a close.
 * `SentrySink.flush()` closes the Sentry client, which is shared by the whole process, and Vercel keeps a function
 * instance warm for later deliveries, so a sink made once at load would drop every error after the first close. Two
 * deliveries can also overlap in one instance, so each `begin()` is paired with a `flush()` and only the last one
 * to finish closes the client: an earlier one leaves it open, and its pending events go out with the last close.
 * Nothing is initialised for a delivery that raises none.
 *
 * @param makeSink - Builds an initialised sink (`resolveErrorSink()` over the environment).
 * @returns The reporter.
 */
export function createErrorReporter(makeSink: () => ErrorSink): ErrorReporter {
	let sink: ErrorSink | undefined;
	let active = 0;
	return {
		begin() {
			active += 1;
		},
		capture(err) {
			try {
				sink ??= makeSink();
				sink.captureException(err);
			} catch (failure) {
				console.error("error reporter: could not report an error", failure);
			}
		},
		async flush() {
			active = Math.max(0, active - 1);
			if (active > 0) return;
			const pending = sink;
			sink = undefined;
			try {
				// The session `init()` starts is ended before the client is closed, so it is reported.
				pending?.endSession();
				await pending?.flush();
			} catch (failure) {
				console.error("error reporter: flush failed", failure);
			}
		},
	};
}
