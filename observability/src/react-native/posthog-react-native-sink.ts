import { redactObject } from "../core/redact.js";
import type { AnalyticsSink } from "../core/sinks.js";
import { type OnError, safely, safelyAsync } from "../shared/safe.js";

/** The slice of a `posthog-react-native` client that {@link PostHogReactNativeSink} calls. */
export interface PostHogReactNativeClient {
	/** The id of the person the client records for now. */
	getDistinctId(): string;
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
	/** Called with each error the sink swallowed from the SDK. Defaults to ignoring them; it can never throw into the app. */
	onError?: OnError;
}

/**
 * `PostHogReactNativeSink` is the `AnalyticsSink` for a React Native app over
 * `posthog-react-native`. The app builds the client (`new PostHog(key, { host })`)
 * and passes it in: the SDK needs the `react-native` runtime to load, so this
 * module never imports it itself.
 *
 * The client has one current person. The rule for `capture(distinctId, ...)`:
 * when `distinctId` is not the client's current id (`getDistinctId()`), the sink
 * calls `identify(distinctId)` first, so the event is never attributed to
 * another person. To record for an anonymous visitor, pass the client's own id.
 *
 * Event and person properties are scrubbed of token-shaped strings. Every call
 * is guarded and never throws; errors go to `onError`. `posthog-react-native`
 * is an optional peer dependency.
 */
export class PostHogReactNativeSink implements AnalyticsSink {
	readonly #client: PostHogReactNativeClient;
	readonly #onError: OnError | undefined;

	/** Wraps `config.client`. */
	constructor(config: PostHogReactNativeSinkConfig) {
		this.#client = config.client;
		this.#onError = config.onError;
	}

	/** Sets the current person to `distinctId` with `props` (scrubbed). */
	identify(distinctId: string, props: Record<string, unknown>): void {
		safely(() => this.#client.identify(distinctId, redactObject(props)), this.#onError, "posthog.identify");
	}

	/** Records `event` with `props` (scrubbed) for `distinctId`, identifying that person first when the client is on another one. */
	capture(distinctId: string, event: string, props: Record<string, unknown>): void {
		safely(
			() => {
				if (this.#client.getDistinctId() !== distinctId) this.#client.identify(distinctId);
				this.#client.capture(event, redactObject(props));
			},
			this.#onError,
			"posthog.capture"
		);
	}

	/** Flushes queued events and stops the client; never rejects. */
	async shutdown(): Promise<void> {
		await safelyAsync(() => this.#client.shutdown(), this.#onError, "posthog.shutdown");
	}
}
