import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

/** Encodes a Zendesk API token credential as base64 `user/token:password`, the value the `token` option expects. */
export const createToken = (user: string, password: string): string =>
	Buffer.from(`${user}/token:${password}`).toString("base64");

/** Options for creating a Zendesk client. */
export interface ZendeskClientOptions {
	/** Base URL of your Zendesk instance, e.g. "https://myorg.zendesk.com". */
	baseUrl: string;
	/** Token from createToken(email, apiToken). */
	token: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createZendeskRestClient(opts: ZendeskClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl,
		token: opts.token,
		vendor: "Zendesk",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
