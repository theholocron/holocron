import posthog from "posthog-js";

import { redactObject } from "../core/redact.js";
import type { AnalyticsSink } from "../core/sinks.js";
import { type OnError, safely, safelyAsync } from "../shared/safe.js";

/** The slice of a `posthog-js` instance that {@link PostHogBrowserSink} calls. */
export interface PostHogBrowserClient {
	/** Starts the client with the project key and options. */
	init(key: string, config: Record<string, unknown>): unknown;
	/** The id of the person the client records for now. */
	get_distinct_id(): string;
	/** Sets the person and their properties. */
	identify(distinctId: string, props?: Record<string, unknown>): unknown;
	/** Records an event for the current person. */
	capture(event: string, props?: Record<string, unknown>): unknown;
	/** Flushes the queue and tears the client down. */
	shutdown(): Promise<void>;
}

/** Options of {@link PostHogBrowserSink}. */
export interface PostHogBrowserSinkConfig {
	/** The project API key. */
	key: string;
	/** The PostHog host (`api_host`). */
	host: string;
	/** The client to call. Defaults to the `posthog-js` singleton; pass a fake in a test. */
	client?: PostHogBrowserClient;
	/**
	 * `posthog-js` options merged over the privacy-safe defaults (`autocapture`,
	 * `capture_pageview`, `capture_pageleave` and `disable_session_recording`
	 * switched off, `person_profiles: "identified_only"`). Set one here to opt in.
	 */
	options?: Record<string, unknown>;
	/** Called with each error the sink swallowed from the SDK. Defaults to ignoring them; it can never throw into the app. */
	onError?: OnError;
}

/** What `posthog-js` records by itself unless asked: all off, and a person profile only once someone is identified. */
const PRIVACY_DEFAULTS: Record<string, unknown> = {
	autocapture: false,
	capture_pageview: false,
	capture_pageleave: false,
	disable_session_recording: true,
	person_profiles: "identified_only",
};

/**
 * `PostHogBrowserSink` is the `posthog-js` call site, an `AnalyticsSink` for a
 * web page or a React app. The constructor starts the client with the
 * resolved key and host and the privacy-safe defaults of
 * {@link PostHogBrowserSinkConfig.options}: nothing is captured except what
 * the app sends through `capture()`.
 *
 * A browser has one current person. The rule for `capture(distinctId, ...)`:
 * when `distinctId` is not the client's current id (`get_distinct_id()`), the
 * sink calls `identify(distinctId)` first, so the event is never attributed to
 * another person. To record for an anonymous visitor, pass the client's own id.
 *
 * Event and person properties are scrubbed of token-shaped strings. Every
 * call is guarded and never throws; errors go to `onError`. `posthog-js` is
 * an optional peer dependency.
 */
export class PostHogBrowserSink implements AnalyticsSink {
	readonly #client: PostHogBrowserClient;
	readonly #onError: OnError | undefined;

	/** Starts the client with `config.key`, `config.host` and the defaults. */
	constructor(config: PostHogBrowserSinkConfig) {
		this.#client = config.client ?? (posthog as unknown as PostHogBrowserClient);
		this.#onError = config.onError;
		safely(
			() => this.#client.init(config.key, { ...PRIVACY_DEFAULTS, ...config.options, api_host: config.host }),
			this.#onError,
			"posthog.init"
		);
	}

	/** Sets the current person to `distinctId` with `props` (scrubbed). */
	identify(distinctId: string, props: Record<string, unknown>): void {
		safely(() => this.#client.identify(distinctId, redactObject(props)), this.#onError, "posthog.identify");
	}

	/** Records `event` with `props` (scrubbed) for `distinctId`, identifying that person first when the client is on another one. */
	capture(distinctId: string, event: string, props: Record<string, unknown>): void {
		safely(
			() => {
				if (this.#client.get_distinct_id() !== distinctId) this.#client.identify(distinctId);
				this.#client.capture(event, redactObject(props));
			},
			this.#onError,
			"posthog.capture"
		);
	}

	/** Flushes queued events and shuts the client down; never rejects. */
	async shutdown(): Promise<void> {
		await safelyAsync(() => this.#client.shutdown(), this.#onError, "posthog.shutdown");
	}
}
