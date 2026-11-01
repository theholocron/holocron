import { createRestClient, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

/** Options for `createVercelClient()` and `createVercelRestClient()`. */
export interface VercelClientOptions {
	/** Vercel API token. */
	token: string;
	/**
	 * Team ID — appended as `?teamId=` on every request. Omit for personal accounts.
	 * Required for team-owned resources (projects, deployments, env vars); without it, requests
	 * target personal account resources only. Find it in Vercel dashboard → Team Settings → General.
	 */
	teamId?: string;
	/** Override base URL for testing. Defaults to https://api.vercel.com. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
}

export function createVercelRestClient(opts: VercelClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.vercel.com",
		token: opts.token,
		defaultQuery: opts.teamId ? { teamId: opts.teamId } : undefined,
		vendor: "Vercel",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
	});
}
