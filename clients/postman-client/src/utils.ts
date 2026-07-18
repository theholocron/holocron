import {
	createRestClient,
	type RequestOptions,
	type RestClient,
} from "@theholocron/http-client";

import { PostmanPlanLimitError, detectPlanLimit } from "./errors.js";

export type { RestClient };

export interface PostmanClientOptions {
	/** Postman API key. */
	token: string;
	/** Override base URL for testing. Defaults to https://api.getpostman.com. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export function createPostmanRestClient(
	opts: PostmanClientOptions,
): RestClient {
	const base = createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.getpostman.com",
		token: opts.token,
		tokenScheme: "apikey",
		apiKeyHeader: "x-api-key",
		vendor: "Postman",
		fetch: opts.fetch,
	});

	return {
		baseUrl: base.baseUrl,
		async request<T>(path: string, reqOpts?: RequestOptions): Promise<T> {
			try {
				return await base.request<T>(path, reqOpts);
			} catch (err: unknown) {
				const details = (err as { details?: string }).details;
				if (typeof details === "string") {
					const limit = detectPlanLimit(details);
					if (limit) throw new PostmanPlanLimitError(limit, details);
				}
				throw err;
			}
		},
	};
}
