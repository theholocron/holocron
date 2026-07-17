import { createRestClient, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface ClerkClientOptions {
	/** Clerk secret key (sk_live_... or sk_test_...). */
	token: string;
	/** Override base URL for testing. Defaults to https://api.clerk.com/v1. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export function createClerkRestClient(opts: ClerkClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.clerk.com/v1",
		token: opts.token,
		vendor: "Clerk",
		fetch: opts.fetch,
	});
}
