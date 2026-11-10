import posthog from "posthog-js";

import type { AnalyticsSink } from "../core/sinks.js";
import { safely, safelyAsync } from "../shared/safe.js";

/** The slice of a `posthog-js` instance that {@link PostHogBrowserSink} calls. */
export interface PostHogBrowserClient {
	/** Starts the client with the project key and options. */
	init(key: string, config: Record<string, unknown>): unknown;
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
}

/**
 * `PostHogBrowserSink` is the `posthog-js` call site, an `AnalyticsSink` for a
 * web page or a React app. The constructor starts the client with the
 * resolved key and host; the SDK defaults apply to everything else.
 * `posthog-js` keeps one current person, so `capture()` records for the person
 * last passed to `identify()` and ignores its `distinctId` argument. Every
 * call is guarded and never throws. `posthog-js` is an optional peer dependency.
 */
export class PostHogBrowserSink implements AnalyticsSink {
	readonly #client: PostHogBrowserClient;

	/** Starts the client with `config.key` and `config.host`. */
	constructor(config: PostHogBrowserSinkConfig) {
		this.#client = config.client ?? (posthog as unknown as PostHogBrowserClient);
		safely(() => this.#client.init(config.key, { api_host: config.host }));
	}

	/** Sets the current person to `distinctId` with `props`. */
	identify(distinctId: string, props: Record<string, unknown>): void {
		safely(() => this.#client.identify(distinctId, props));
	}

	/** Records `event` with `props` for the current person; `distinctId` is not used. */
	capture(_distinctId: string, event: string, props: Record<string, unknown>): void {
		safely(() => this.#client.capture(event, props));
	}

	/** Flushes queued events and shuts the client down; never rejects. */
	async shutdown(): Promise<void> {
		await safelyAsync(() => this.#client.shutdown());
	}
}
