import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

/** Options for `createTurboClient()` and `createTurboRestClient()`. */
export interface TurboClientOptions {
	/** The token Turborepo sends to the remote cache: a Vercel token (`TURBO_TOKEN`). */
	token: string;
	/** Override base URL for testing. Defaults to https://api.vercel.com, which serves Turborepo's Remote Cache. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createTurboRestClient(opts: TurboClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.vercel.com",
		token: opts.token,
		vendor: "Turbo",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
