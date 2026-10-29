import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface AxiomClientOptions {
	/** Axiom API token. */
	token: string;
	/** Override base URL for testing. Defaults to https://api.axiom.co. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createAxiomRestClient(opts: AxiomClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.axiom.co",
		token: opts.token,
		vendor: "Axiom",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
