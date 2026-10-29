import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface NetlifyClientOptions {
	/** Netlify Personal Access Token. */
	token: string;
	/** Override base URL for testing. Defaults to https://api.netlify.com/api/v1. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createNetlifyRestClient(opts: NetlifyClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.netlify.com/api/v1",
		token: opts.token,
		vendor: "Netlify",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
