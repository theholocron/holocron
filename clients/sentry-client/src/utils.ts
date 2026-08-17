import { createRestClient, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface SentryClientOptions {
	token: string;
	/** Override base URL for testing. Defaults to https://sentry.io/api/0 */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export function createSentryRestClient(opts: SentryClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://sentry.io/api/0",
		token: opts.token,
		vendor: "Sentry",
		fetch: opts.fetch,
	});
}
