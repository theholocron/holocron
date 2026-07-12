import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

export function createNeonRestClient(opts: {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://console.neon.tech/api/v2",
		token: opts.token,
		vendor: "Neon",
		fetch: opts.fetch,
	});
}
