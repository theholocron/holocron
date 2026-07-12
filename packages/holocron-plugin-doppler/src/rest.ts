import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

export function createDopplerRestClient(opts: {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.doppler.com/v3",
		token: opts.token,
		vendor: "Doppler",
		fetch: opts.fetch,
	});
}
