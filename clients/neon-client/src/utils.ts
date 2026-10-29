import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface NeonClientOptions {
	/** Neon API key. */
	token: string;
	/** Override base URL for testing. Defaults to https://console.neon.tech/api/v2. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createNeonRestClient(opts: NeonClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://console.neon.tech/api/v2",
		token: opts.token,
		vendor: "Neon",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
