import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface ClerkClientOptions {
	/** Clerk secret key (sk_live_... or sk_test_...). */
	token: string;
	/** Override base URL for testing. Defaults to https://api.clerk.com/v1. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createClerkRestClient(opts: ClerkClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.clerk.com/v1",
		token: opts.token,
		vendor: "Clerk",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
