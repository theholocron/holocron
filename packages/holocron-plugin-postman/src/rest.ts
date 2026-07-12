import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/cli";

import { PostmanPlanLimitError, detectPlanLimit } from "./errors.js";

export type { RequestOptions, RestClient };

export function createPostmanRestClient(opts: {
	token: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}): RestClient {
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
			// Attempt to call base.request; on non-2xx it throws ProviderApiError.
			// We intercept here to discriminate plan-limit 4xx before the generic
			// ProviderApiError bubbles up, since plan-limit needs its own error type.
			let res: T;
			try {
				res = await base.request<T>(path, reqOpts);
			} catch (err: unknown) {
				// Re-check if it's a plan-limit JSON body wrapped in ProviderApiError.
				// ProviderApiError.details contains the raw response text.
				const details = (err as { details?: string }).details;
				if (typeof details === "string") {
					const limit = detectPlanLimit(details);
					if (limit) throw new PostmanPlanLimitError(limit, details);
				}
				throw err;
			}
			return res;
		},
	};
}
