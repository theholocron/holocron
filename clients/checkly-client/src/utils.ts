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
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createChecklyRestClient(opts: ChecklyClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.checklyhq.com/v1",
		token: opts.token,
		vendor: "Checkly",
		extraHeaders: { "x-checkly-account": opts.accountId },
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
