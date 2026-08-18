import type { Analytics } from "@theholocron/cli";
import { createPostHogClient, type PostHogClient } from "@theholocron/posthog-client";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { PostHogAnalytics, type PostHogAnalyticsOptions } from "./capabilities/analytics.js";

export interface PostHogPluginOptions extends ResolveTokenInput, PostHogAnalyticsOptions {
	/**
	 * PostHog instance host. Defaults to US cloud.
	 * EU cloud: "https://eu.posthog.com"
	 * Self-hosted: your own base URL.
	 */
	host?: string;
	/** Override base URL for tests (takes precedence over host). */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: PostHogPluginOptions;
	client: PostHogClient;
}

export function createContext(options: PostHogPluginOptions = {}): PluginContext {
	const token = resolveToken(options);
	return {
		options,
		client: createPostHogClient({ token, host: options.host, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function analytics(ctx: PluginContext): Analytics {
	return new PostHogAnalytics(ctx.client, { host: ctx.options.host });
}

export function createPlugin(options: PostHogPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-posthog",
		capabilities: {
			analytics: () => analytics(ctx),
		},
	};
}

export const AUTH_HINT =
	"create a personal API key at https://app.posthog.com/settings/user/api-keys " +
	"(not the project API key — that is the client-side phc_* tracking token), " +
	"then run: holocron auth set posthog <phx_KEY>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { PostHogAnalytics, type PostHogAnalyticsOptions } from "./capabilities/analytics.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
export {
	createPostHogClient,
	type PostHogClient,
	type PostHogClientOptions,
	type PostHogProject,
	type PostHogProjectsResponse,
	type PostHogUser,
} from "@theholocron/posthog-client";
