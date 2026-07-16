import { createRestClient, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface GitHubClientOptions {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

export function createGitHubRestClient(opts: GitHubClientOptions): RestClient {
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

/** `/repos/owner/name` prefix from a `"owner/name"` repo string. */
export function repoBase(repo: string): string {
	const [owner, name] = repo.split("/", 2);
	return `/repos/${owner}/${name}`;
}
