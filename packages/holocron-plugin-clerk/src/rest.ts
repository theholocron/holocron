import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

export function createClerkRestClient(opts: {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.clerk.com/v1",
		token: opts.token,
		vendor: "Clerk",
		fetch: opts.fetch,
	});
}
