import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

export function createVercelRestClient(opts: {
	token: string;
	teamId?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.vercel.com",
		token: opts.token,
		defaultQuery: opts.teamId ? { teamId: opts.teamId } : undefined,
		vendor: "Vercel",
		fetch: opts.fetch,
	});
}
