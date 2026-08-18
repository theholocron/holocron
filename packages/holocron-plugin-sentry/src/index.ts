import type { Observability } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { SentryObservability, type SentryObservabilityOptions } from "./capabilities/observability.js";
import { createSentryClient, type SentryClient } from "./rest.js";

export interface SentryPluginOptions extends ResolveTokenInput, SentryObservabilityOptions {
	/** Sentry organization slug. Required. Narrows ResolveTokenInput.org (optional) to string. */
	org: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: SentryPluginOptions;
	client: SentryClient;
}

export function createContext(options: SentryPluginOptions): PluginContext {
	if (!options.org) throw new Error("@theholocron/holocron-plugin-sentry requires `org` in options");
	const token = resolveToken(options);
	return {
		options,
		client: createSentryClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function observability(ctx: PluginContext): Observability {
	return new SentryObservability(ctx.client, { org: ctx.options.org, team: ctx.options.team });
}

export function createPlugin(options: SentryPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-sentry",
		capabilities: {
			observability: () => observability(ctx),
		},
	};
}

export const AUTH_HINT =
	"generate an auth token at https://sentry.io/settings/account/api/auth-tokens/ " +
	"with project:read, project:write, and org:read scopes, " +
	"then run: holocron auth set sentry <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { SentryObservability, type SentryObservabilityOptions } from "./capabilities/observability.js";
export { createSentryClient, type SentryClient, type SentryClientOptions } from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
