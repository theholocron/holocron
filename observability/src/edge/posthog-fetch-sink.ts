import { redactObject } from "../core/redact.js";
import type { AnalyticsSink } from "../core/sinks.js";
import { type OnError, report, safely } from "../shared/safe.js";

/** The part of a `fetch` response the sink reads. */
export interface FetchResponseLike {
	/** `true` for a 2xx status. */
	ok?: boolean;
	/** The HTTP status. */
	status?: number;
}

/** The `fetch` shape the sink needs; the global `fetch` of every edge runtime fits. */
export type FetchLike = (
	url: string,
	init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<FetchResponseLike | unknown>;

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
	/** Milliseconds before a request is aborted. Defaults to `5000`. */
	requestTimeoutMs?: number;
	/** Called with each error the sink swallowed (a rejected request, an HTTP error status, a timeout, a dropped event). Defaults to ignoring them; it can never throw into the app. */
	onError?: OnError;
}

/**
 * `PostHogFetchSink` is an `AnalyticsSink` for edge and worker runtimes that
 * talks to PostHog's HTTP capture endpoint with `fetch`. It imports no SDK and
 * no Node built-in, so it has no peer dependency. Each call sends one request
 * at once (no batching: an isolate may be frozen right after the response).
 *
 * - Properties, including person properties, are scrubbed of token-shaped strings.
 * - A request is aborted after `requestTimeoutMs`. A non-2xx response or a
 *   rejected request goes to `onError`. There is no retry: the event is dropped.
 * - `shutdown(timeoutMs)` stops accepting events (later calls go to `onError`
 *   and are dropped), then waits for every accepted request, at most `timeoutMs`.
 * - Every call is guarded and never throws.
 */
export class PostHogFetchSink implements AnalyticsSink {
	readonly #key: string;
	readonly #url: string;
	readonly #fetch: FetchLike;
	readonly #waitUntil: ((pending: Promise<unknown>) => void) | undefined;
	readonly #timeoutMs: number;
	readonly #onError: OnError | undefined;
	readonly #pending = new Set<Promise<unknown>>();
	#closed = false;

	/** Builds the sink for `config.key` and `config.host`. */
	constructor(config: PostHogFetchSinkConfig) {
		this.#key = config.key;
		this.#url = `${config.host.replace(/\/+$/, "")}/capture/`;
		this.#fetch = config.fetch ?? ((url, init) => fetch(url, init));
		this.#waitUntil = config.waitUntil;
		this.#timeoutMs = config.requestTimeoutMs ?? 5_000;
		this.#onError = config.onError;
	}

	/**
	 * Sends a `$identify` event that sets `props` on the person `distinctId`.
	 * Pass `previousId`, the anonymous id the visitor had before, to merge their
	 * earlier events into the person (sent as `$anon_distinct_id`).
	 */
	identify(distinctId: string, props: Record<string, unknown>, previousId?: string): void {
		this.#send(distinctId, "$identify", {
			$set: props,
			...(previousId === undefined ? {} : { $anon_distinct_id: previousId }),
		});
	}

	/** Sends `event` for `distinctId` with `props`. */
	capture(distinctId: string, event: string, props: Record<string, unknown>): void {
		this.#send(distinctId, event, props);
	}

	/** Stops accepting events and waits for the accepted requests, for at most `timeoutMs` (default 5000); never rejects. */
	async shutdown(timeoutMs = 5_000): Promise<void> {
		this.#closed = true;
		if (this.#pending.size === 0) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const expired = new Promise<"timeout">((resolve) => {
			timer = setTimeout(() => resolve("timeout"), timeoutMs);
		});
		const outcome = await Promise.race([Promise.allSettled([...this.#pending]), expired]);
		clearTimeout(timer);
		if (outcome === "timeout") report(this.#onError, new Error("shutdown timed out"), "posthog.fetch.shutdown");
	}

	#send(distinctId: string, event: string, properties: Record<string, unknown>): void {
		if (this.#closed) {
			report(this.#onError, new Error(`dropped "${event}": the sink is shut down`), "posthog.fetch.closed");
			return;
		}
		safely(
			() => {
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
				let started: Promise<unknown> | unknown;
				try {
					started = this.#fetch(this.#url, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							api_key: this.#key,
							event,
							distinct_id: distinctId,
							properties: redactObject(properties),
						}),
						signal: controller.signal,
					});
				} catch (error) {
					clearTimeout(timer);
					throw error;
				}
				const request: Promise<unknown> = Promise.resolve(started)
					.then((response) => {
						const res = response as FetchResponseLike | null | undefined;
						if (res && res.ok === false) {
							report(
								this.#onError,
								new Error(`PostHog responded ${String(res.status)}`),
								"posthog.fetch.response"
							);
						}
					})
					.catch((error: unknown) => report(this.#onError, error, "posthog.fetch"))
					.finally(() => {
						clearTimeout(timer);
						this.#pending.delete(request);
					});
				this.#pending.add(request);
				safely(() => this.#waitUntil?.(request), this.#onError, "posthog.fetch.waitUntil");
			},
			this.#onError,
			"posthog.fetch.send"
		);
	}
}
