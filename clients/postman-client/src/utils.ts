import { createRestClient, type RequestOptions, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

import { detectPlanLimit, PostmanPlanLimitError } from "./errors.js";

export type { RestClient };

export interface PostmanClientOptions {
	/** Postman API key. */
	token: string;
	/** Override base URL for testing. Defaults to https://api.getpostman.com. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createPostmanRestClient(opts: PostmanClientOptions): RestClient {
	const base = createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.getpostman.com",
		token: opts.token,
		tokenScheme: "apikey",
		apiKeyHeader: "x-api-key",
		vendor: "Postman",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
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
