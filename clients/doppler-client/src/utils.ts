import { createRestClient, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface DopplerClientOptions {
	/** Doppler service token or personal token. */
	token: string;
	/** Override base URL for testing. Defaults to https://api.doppler.com/v3. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export function createDopplerRestClient(opts: DopplerClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.doppler.com/v3",
		token: opts.token,
		vendor: "Doppler",
		fetch: opts.fetch,
	});
}
