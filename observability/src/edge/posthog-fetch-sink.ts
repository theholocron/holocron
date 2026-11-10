import type { AnalyticsSink } from "../core/sinks.js";
import { safely, safelyAsync } from "../shared/safe.js";

/** The `fetch` shape the sink needs; the global `fetch` of every edge runtime fits. */
export type FetchLike = (
	url: string,
	init: { method: string; headers: Record<string, string>; body: string }
) => Promise<unknown>;

/** Options of {@link PostHogFetchSink}. */
export interface PostHogFetchSinkConfig {
	/** The project API key. */
	key: string;
	/** The PostHog host, such as `https://us.i.posthog.com`. */
	host: string;
	/** The `fetch` to call. Defaults to the global `fetch`; pass a fake in a test. */
	fetch?: FetchLike;
	/** Registers a pending request with the runtime (`ctx.waitUntil` in a Cloudflare Worker, `waitUntil` in a Vercel edge function). */
	waitUntil?: (pending: Promise<unknown>) => void;
}

/**
 * `PostHogFetchSink` is an `AnalyticsSink` for edge and worker runtimes that
 * talks to PostHog's HTTP capture endpoint with `fetch`. It imports no SDK and
 * no Node built-in, so it has no peer dependency. Each call sends one request
 * at once (no batching: an isolate may be frozen right after the response);
 * `shutdown()` waits for the requests still in flight. Every call is guarded
 * and never throws.
 */
export class PostHogFetchSink implements AnalyticsSink {
	readonly #key: string;
	readonly #url: string;
	readonly #fetch: FetchLike;
	readonly #waitUntil: ((pending: Promise<unknown>) => void) | undefined;
	readonly #pending = new Set<Promise<unknown>>();

	/** Builds the sink for `config.key` and `config.host`. */
	constructor(config: PostHogFetchSinkConfig) {
		this.#key = config.key;
		this.#url = `${config.host.replace(/\/+$/, "")}/capture/`;
		this.#fetch = config.fetch ?? ((url, init) => fetch(url, init));
		this.#waitUntil = config.waitUntil;
	}

	/** Sends a `$identify` event that sets `props` on the person `distinctId`. */
	identify(distinctId: string, props: Record<string, unknown>): void {
		this.#send(distinctId, "$identify", { $set: props });
	}

	/** Sends `event` for `distinctId` with `props`. */
	capture(distinctId: string, event: string, props: Record<string, unknown>): void {
		this.#send(distinctId, event, props);
	}

	/** Waits for the requests in flight; never rejects. */
	async shutdown(): Promise<void> {
		await safelyAsync(() => Promise.allSettled([...this.#pending]));
	}

	#send(distinctId: string, event: string, properties: Record<string, unknown>): void {
		safely(() => {
			const request: Promise<unknown> = Promise.resolve(
				this.#fetch(this.#url, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ api_key: this.#key, event, distinct_id: distinctId, properties }),
				})
			)
				.catch(() => undefined)
				.finally(() => this.#pending.delete(request));
			this.#pending.add(request);
			safely(() => this.#waitUntil?.(request));
		});
	}
}
