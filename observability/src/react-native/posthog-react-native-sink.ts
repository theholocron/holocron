import type { AnalyticsSink } from "../core/sinks.js";
import { safely, safelyAsync } from "../shared/safe.js";

/** The slice of a `posthog-react-native` client that {@link PostHogReactNativeSink} calls. */
export interface PostHogReactNativeClient {
	/** Sets the person and their properties. */
	identify(distinctId: string, props?: Record<string, unknown>): unknown;
	/** Records an event for the current person. */
	capture(event: string, props?: Record<string, unknown>): unknown;
	/** Flushes the queue and stops the client. */
	shutdown(): Promise<void>;
}

/** Options of {@link PostHogReactNativeSink}. */
export interface PostHogReactNativeSinkConfig {
	/** A `new PostHog(key, { host })` from `posthog-react-native`, built by the app. */
	client: PostHogReactNativeClient;
}

/**
 * `PostHogReactNativeSink` is the `AnalyticsSink` for a React Native app over
 * `posthog-react-native`. The app builds the client (`new PostHog(key, { host })`)
 * and passes it in: the SDK needs the `react-native` runtime to load, so this
 * module never imports it itself. The client keeps one current person, so
 * `capture()` records for the person last passed to `identify()` and ignores its
 * `distinctId` argument. Every call is guarded and never throws.
 * `posthog-react-native` is an optional peer dependency.
 */
export class PostHogReactNativeSink implements AnalyticsSink {
	readonly #client: PostHogReactNativeClient;

	/** Wraps `config.client`. */
	constructor(config: PostHogReactNativeSinkConfig) {
		this.#client = config.client;
	}

	/** Sets the current person to `distinctId` with `props`. */
	identify(distinctId: string, props: Record<string, unknown>): void {
		safely(() => this.#client.identify(distinctId, props));
	}

	/** Records `event` with `props` for the current person; `distinctId` is not used. */
	capture(_distinctId: string, event: string, props: Record<string, unknown>): void {
		safely(() => this.#client.capture(event, props));
	}

	/** Flushes queued events and stops the client; never rejects. */
	async shutdown(): Promise<void> {
		await safelyAsync(() => this.#client.shutdown());
	}
}
