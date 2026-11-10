import { SentryCompatibleSink, type SentrySdkLike, type SentrySinkOptions } from "../shared/sentry-compatible-sink.js";

/** Options of {@link SentryReactNativeSink}. */
export interface SentryReactNativeSinkOptions extends Omit<SentrySinkOptions, "sdk"> {
	/** The `@sentry/react-native` namespace, as the app imports it (`import * as Sentry from "@sentry/react-native"`). */
	sdk: SentrySdkLike;
}

/**
 * `SentryReactNativeSink` is the `ErrorSink` for a React Native app over
 * `@sentry/react-native`. The app imports the SDK and passes it in as
 * `options.sdk`: the SDK needs the `react-native` runtime to load, so this
 * module never imports it itself and stays loadable (and testable) anywhere.
 * `sessions` defaults to `false` here, because the native layer tracks
 * release-health sessions. `@sentry/react-native` is an optional peer
 * dependency. Pair it with `Sentry.wrap(App)` for the native crash and
 * navigation integrations, which sit outside this interface.
 */
export class SentryReactNativeSink extends SentryCompatibleSink {
	/** Builds the sink over `options.sdk`. */
	constructor(options: SentryReactNativeSinkOptions) {
		super(options.sdk, { ...options, sessions: options.sessions ?? false });
	}
}
