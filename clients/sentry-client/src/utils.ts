import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface SentryClientOptions {
	token: string;
	/** Override base URL for testing. Defaults to https://sentry.io/api/0 */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createSentryRestClient(opts: SentryClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://sentry.io/api/0",
		token: opts.token,
		vendor: "Sentry",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
