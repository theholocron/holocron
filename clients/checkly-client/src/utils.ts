import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

/** Options for `createChecklyClient`. */
export interface ChecklyClientOptions {
	/** Checkly API key — sent as a Bearer token. */
	token: string;
	/** The target Checkly account id. Every endpoint requires this. */
	accountId: string;
	/** Override base URL for testing. Defaults to https://api.checklyhq.com/v1 */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Abort a request that has not answered after this many milliseconds. Defaults to no limit. */
	timeoutMs?: number;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

/** The v1 API base, which the v3 status page client derives its own from. */
export const DEFAULT_BASE = "https://api.checklyhq.com/v1";

/** `fetch` that aborts a request after `timeoutMs`, unless the caller already passed a signal. */
function withTimeout(base: typeof fetch, timeoutMs: number): typeof fetch {
	return (input, init) => base(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
}

export function createChecklyRestClient(opts: ChecklyClientOptions): RestClient {
	const timed =
		opts.timeoutMs === undefined ? opts.fetch : withTimeout(opts.fetch ?? globalThis.fetch, opts.timeoutMs);
	return createRestClient({
		baseUrl: opts.baseUrl ?? DEFAULT_BASE,
		token: opts.token,
		vendor: "Checkly",
		extraHeaders: { "x-checkly-account": opts.accountId },
		fetch: timed,
		logger: opts.logger,
		errors: opts.errors,
	});
}
