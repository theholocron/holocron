import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

import { createGitHubGraphQLClient, type GraphQLClient } from "./graphql/graphql.js";

export type { GraphQLClient, RestClient };

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

/** GitHub's GraphQL endpoint — a distinct client from `createGitHubRestClient()`'s REST one; see `graphql/graphql.ts` for why a shared transport still needed its own response-error handling. */
export function createGitHubGraphQLApiClient(opts: GitHubClientOptions): GraphQLClient {
	return createGitHubGraphQLClient({
		baseUrl: opts.baseUrl,
		token: opts.token,
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

/** `["owner", "name"]` from a `"owner/name"` repo string — GraphQL's `repository(owner:, name:)` args take them separately, unlike REST's single path segment. */
export function splitRepo(repo: string): [owner: string, name: string] {
	const [owner, name] = repo.split("/", 2);
	return [owner ?? "", name ?? ""];
}
