import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

export type { RequestOptions, RestClient };

export function createGitHubRestClient(opts: { token: string; baseUrl?: string; fetch?: typeof fetch }): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.github.com",
		token: opts.token,
		extraHeaders: {
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
		},
		vendor: "GitHub",
		fetch: opts.fetch,
	});
}
