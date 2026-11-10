/**
 * `@theholocron/observability/react-native`: error tracking and analytics for a
 * React Native app.
 *
 * `SentryReactNativeSink` (over `@sentry/react-native`) implements
 * {@link ErrorSink} and `PostHogReactNativeSink` (over `posthog-react-native`)
 * implements {@link AnalyticsSink}, both from `/core`; for logging use
 * `ConsoleLogger` from `/logger`. Both SDKs need the `react-native` runtime to
 * load, so the app imports them and passes them in; this module imports neither
 * and no Node built-in. The SDKs are optional peer dependencies. The caller
 * resolves the DSN and the project key.
 */

export type { AnalyticsSink, ErrorSink } from "./core/sinks.js";
export { NoopAnalyticsSink, NoopErrorSink } from "./core/sinks.js";
export type {
	PostHogReactNativeClient,
	PostHogReactNativeSinkConfig,
} from "./react-native/posthog-react-native-sink.js";
export { PostHogReactNativeSink } from "./react-native/posthog-react-native-sink.js";
export type { SentryReactNativeSinkOptions } from "./react-native/sentry-react-native-sink.js";
export { SentryReactNativeSink } from "./react-native/sentry-react-native-sink.js";
export type { SentrySdkLike } from "./shared/sentry-compatible-sink.js";
export { scrubEvent } from "./shared/sentry-compatible-sink.js";
