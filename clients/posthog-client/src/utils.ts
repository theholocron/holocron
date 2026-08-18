import { createRestClient, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface PostHogClientOptions {
	token: string;
	/**
	 * PostHog host. Defaults to `https://app.posthog.com`.
	 * Use `https://eu.posthog.com` for EU cloud, or your self-hosted URL.
	 */
	host?: string;
	/** Override base URL for testing. Takes precedence over `host`. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export function createPostHogRestClient(opts: PostHogClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? opts.host ?? "https://app.posthog.com",
		token: opts.token,
		vendor: "PostHog",
		fetch: opts.fetch,
	});
}
