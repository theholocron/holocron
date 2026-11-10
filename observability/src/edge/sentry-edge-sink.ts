import * as Sentry from "@sentry/vercel-edge";

import { SentryCompatibleSink, type SentrySdkLike, type SentrySinkOptions } from "../shared/sentry-compatible-sink.js";

/**
 * `SentryEdgeSink` is the `@sentry/vercel-edge` call site, an `ErrorSink` for an
 * edge or worker runtime (WinterCG: no `window`, no Node built-ins). The edge
 * SDK has no release-health sessions, so `endSession()` does nothing.
 * `@sentry/vercel-edge` is an optional peer dependency. Pass `options.sdk` to
 * inject a fake. In a Cloudflare Worker, call `flush()` inside
 * `ctx.waitUntil()` so the events leave before the isolate is frozen.
 */
export class SentryEdgeSink extends SentryCompatibleSink {
	/** Builds the sink over `@sentry/vercel-edge`, or over `options.sdk` when given. */
	constructor(options: SentrySinkOptions = {}) {
		super(options.sdk ?? (Sentry as SentrySdkLike), options);
	}
}
