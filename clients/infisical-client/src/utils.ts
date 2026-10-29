import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface InfisicalClientOptions {
	/** Infisical Universal Auth machine identity token or personal token. */
	token: string;
	/** Override base URL for testing. Defaults to https://app.infisical.com/api. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createInfisicalRestClient(opts: InfisicalClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://app.infisical.com/api",
		token: opts.token,
		vendor: "Infisical",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
