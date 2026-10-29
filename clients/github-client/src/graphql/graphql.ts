import { createRestClient, ProviderApiError, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

/**
 * GitHub's GraphQL API has exactly one endpoint (`POST /graphql`, always) —
 * unlike REST's per-resource paths, there's nothing here for `createRestClient()`
 * to route on. Reused anyway for the transport it already gets right (auth
 * header, JSON body/parsing, network-failure wrapping into `ProviderApiError`
 * with `status: 0`) — only the response-shape difference needs handling on
 * top: GraphQL always answers `200 OK`, even for a query error, with the
 * error(s) in the response body's own `errors` array rather than the HTTP
 * status. `createRestClient()`'s own `!res.ok` branch never fires for a
 * GraphQL error — this wrapper's the one place that translates a 200 with a
 * populated `errors` array into a thrown `ProviderApiError`, matching the
 * REST client's own error-throwing contract so callers don't need to know
 * which transport they're talking to.
 */
export interface GraphQLClient {
	query<T>(document: string, variables?: Record<string, unknown>): Promise<T>;
}

export interface GraphQLClientConfig {
	token: string;
	/** Defaults to `"https://api.github.com"` — `/graphql` is appended internally. */
	baseUrl?: string;
	fetch?: typeof fetch;
	logger?: Logger;
	errors?: ErrorSink;
}

interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{ message: string }>;
}

export function createGitHubGraphQLClient(config: GraphQLClientConfig): GraphQLClient {
	const rest: RestClient = createRestClient({
		baseUrl: config.baseUrl ?? "https://api.github.com",
		token: config.token,
		vendor: "GitHub GraphQL",
		fetch: config.fetch,
		logger: config.logger,
		errors: config.errors,
	});

	return {
		async query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
			const result = await rest.request<GraphQLResponse<T>>("/graphql", {
				method: "POST",
				body: { query: document, variables },
			});

			if (result.errors && result.errors.length > 0) {
				throw new ProviderApiError(
					`GitHub GraphQL → ${result.errors.map((e) => e.message).join("; ")}`,
					200,
					result.errors
				);
			}

			// A well-formed GraphQL response always has `data` when `errors` is
			// empty/absent — the `undefined` case is defensive typing only, not
			// a shape GitHub's own API actually returns.
			return result.data as T;
		},
	};
}
