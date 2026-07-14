import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

export function createInfisicalRestClient(opts: { token: string; baseUrl?: string; fetch?: typeof fetch }): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://app.infisical.com/api",
		token: opts.token,
		vendor: "Infisical",
		fetch: opts.fetch,
	});
}
