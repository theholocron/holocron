import { createRestClient, ProviderApiError, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

/** Sends one GraphQL document to Linear and returns its `data`. */
export interface LinearGraphQL {
	/** Runs a query or mutation; a response with `errors` throws a `ProviderApiError`. */
	query<T>(document: string, variables?: Record<string, unknown>): Promise<T>;
}

/** Options of {@link createLinearGraphQL}. */
export interface LinearGraphQLConfig {
	/** A personal API key (`lin_api_...`, sent as is) or an OAuth access token (`lin_oauth_...`, sent as a bearer). */
	token: string;
	/** Defaults to `https://api.linear.app`; `/graphql` is appended. */
	baseUrl?: string;
	/** Overrides `fetch`, for tests. */
	fetch?: typeof fetch;
	/** Structured logger for request diagnostics. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. */
	errors?: ErrorSink;
}

interface GraphQLResponse<T> {
	data?: T;
	errors?: Array<{ message: string }>;
}

/**
 * Linear answers a failed query with HTTP 200 (or 400) and an `errors` array, so this wrapper turns that into the same
 * `ProviderApiError` the REST clients throw. Linear sends a personal key as the bare `Authorization` value and an
 * OAuth token as `Bearer <token>`.
 */
export function createLinearGraphQL(config: LinearGraphQLConfig): LinearGraphQL {
	const oauth = config.token.startsWith("lin_oauth_");
	const rest: RestClient = createRestClient({
		baseUrl: config.baseUrl ?? "https://api.linear.app",
		token: config.token,
		...(oauth ? {} : { tokenScheme: "apikey" as const, apiKeyHeader: "authorization" }),
		vendor: "Linear",
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
					`Linear GraphQL → ${result.errors.map((e) => e.message).join("; ")}`,
					200,
					result.errors
				);
			}
			return result.data as T;
		},
	};
}

/** A page of a Linear connection. */
export interface Connection<T> {
	/** The nodes of this page. */
	nodes: T[];
	/** Where the next page starts. */
	pageInfo: {
		/** Whether another page follows. */
		hasNextPage: boolean;
		/** The cursor to pass to fetch that page. */
		endCursor: string | null;
	};
}

/** Reads every page of a connection; `fetchPage` receives the cursor to continue from (`null` for the first). */
export async function paginate<T>(fetchPage: (after: string | null) => Promise<Connection<T>>): Promise<T[]> {
	const all: T[] = [];
	let after: string | null = null;
	for (;;) {
		const page: Connection<T> = await fetchPage(after);
		all.push(...page.nodes);
		if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return all;
		after = page.pageInfo.endCursor;
	}
}
