import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

import { page } from "./page/index.js";

export { page };

export interface ConfluenceClientOptions {
	/** Base URL including the API path, e.g. "https://myorg.atlassian.net/wiki/rest/api". */
	baseUrl: string;
	/** Base64-encoded "email:apiToken" — use Buffer.from("email:token").toString("base64"). */
	token: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

function createConfluenceRestClient(opts: ConfluenceClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl,
		token: opts.token,
		vendor: "Confluence",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}

export function createConfluenceClient(opts: ConfluenceClientOptions) {
	const rest = createConfluenceRestClient(opts);
	return {
		page: page(rest),
	};
}
