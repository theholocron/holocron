import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface GitHubClientOptions {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
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
		logger: opts.logger,
		errors: opts.errors,
	});
}

/** `/repos/owner/name` prefix from a `"owner/name"` repo string. */
export function repoBase(repo: string): string {
	const [owner, name] = repo.split("/", 2);
	return `/repos/${owner}/${name}`;
}
