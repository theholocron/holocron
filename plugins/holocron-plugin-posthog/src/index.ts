import type { Analytics } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";
import { createPostHogClient, type PostHogClient } from "@theholocron/posthog-client";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { PostHogAnalytics, type PostHogAnalyticsOptions } from "./capabilities/analytics.js";
import { verifyToken } from "./verify-token.js";

/** Options for the PostHog plugin: token resolution, the instance host and test overrides. */
export interface PostHogPluginOptions extends ResolveTokenInput, PostHogAnalyticsOptions {
	/**
	 * PostHog instance host. Defaults to US cloud.
	 * EU cloud: "https://eu.posthog.com"
	 * Self-hosted: your own base URL.
	 */
	host?: string;
	/** Override base URL for tests (takes precedence over host). */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** What the plugin's capabilities share: the options and a lazily built client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: PostHogPluginOptions;
	/** Builds the PostHog client on first call and reuses it; the token is resolved then, not at plugin load. */
	client: () => PostHogClient;
}

/** Creates the shared context for the given options; no token is resolved until `client()` is first called. */
export function createContext(options: PostHogPluginOptions = {}): PluginContext {
	let client: PostHogClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createPostHogClient({
				token: resolveToken(options),
				host: options.host,
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `analytics` capability from a plugin context. */
export function analytics(ctx: PluginContext): Analytics {
	return new PostHogAnalytics(ctx.client, { host: ctx.options.host });
}

/** Creates the PostHog plugin: a `connection` probe and the `analytics` capability. */
export function createPlugin(options: PostHogPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-posthog",
		probes: {
			connection: connectionProbe({
				provider: "PostHog",
				url: options.baseUrl ?? options.host ?? "https://app.posthog.com",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) =>
					verifyToken(token, { host: options.host, baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
		capabilities: {
			analytics: () => analytics(ctx),
		},
	};
}

/** One-line hint shown by `holocron auth set posthog` when no token is given or the token is rejected. */
export const AUTH_HINT =
	"create a personal API key at https://app.posthog.com/settings/user/api-keys " +
	"(not the project API key — that is the client-side phc_* tracking token), " +
	"then run: holocron auth set posthog <phx_KEY>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { PostHogAnalytics, type PostHogAnalyticsOptions } from "./capabilities/analytics.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
export {
	createPostHogClient,
	type PostHogClient,
	type PostHogClientOptions,
	type PostHogProject,
	type PostHogProjectsResponse,
	type PostHogUser,
} from "@theholocron/posthog-client";
