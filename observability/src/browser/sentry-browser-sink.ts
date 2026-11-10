import * as Sentry from "@sentry/browser";

import { SentryCompatibleSink, type SentrySdkLike, type SentrySinkOptions } from "../shared/sentry-compatible-sink.js";

/**
 * `SentryBrowserSink` is the `@sentry/browser` call site, an `ErrorSink` for a
 * web page or a React app (React Native has its own subpath). `@sentry/browser`
 * is an optional peer dependency. Pass `options.sdk` to inject a fake.
 */
export class SentryBrowserSink extends SentryCompatibleSink {
	/** Builds the sink over `@sentry/browser`, or over `options.sdk` when given. */
	constructor(options: SentrySinkOptions = {}) {
		super(options.sdk ?? (Sentry as SentrySdkLike), options);
	}
}
