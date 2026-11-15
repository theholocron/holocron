import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

/** Options for `createCodecovClient`. */
export interface CodecovClientOptions {
	/** A Codecov API token (a personal access token from the account's Access settings), sent as a bearer token. */
	token: string;
	/** Override base URL for testing. Defaults to https://api.codecov.io/api/v2. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

/** Builds the REST client every Codecov group shares. */
export function createCodecovRestClient(opts: CodecovClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.codecov.io/api/v2",
		token: opts.token,
		vendor: "Codecov",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
