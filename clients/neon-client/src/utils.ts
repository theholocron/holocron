import { createRestClient, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface NeonClientOptions {
	/** Neon API key. */
	token: string;
	/** Override base URL for testing. Defaults to https://console.neon.tech/api/v2. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export function createNeonRestClient(opts: NeonClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://console.neon.tech/api/v2",
		token: opts.token,
		vendor: "Neon",
		fetch: opts.fetch,
	});
}
