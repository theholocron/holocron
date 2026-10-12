/**
 * `@theholocron/holocron-plugin-checkly` — entrypoint.
 *
 * Implements the `monitoring` capability against Checkly's REST API.
 * Also exports `verifyToken` + `AUTH_HINT` for `holocron auth`. See
 * README for auth + config docs.
 */

import type { Monitoring, MonitoringCheckInput } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { ChecklyMonitoring } from "./capabilities/monitoring.js";
import { type ChecklyRestClient, createChecklyRestClient } from "./rest.js";

export interface ChecklyPluginOptions extends ResolveTokenInput {
	/** Checkly account id — required on every request, not a secret (same status as Vercel's teamId). */
	accountId: string;
	/** Checks `holocron repo setup` should ensure exist. */
	checks?: MonitoringCheckInput[];
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: ChecklyPluginOptions;
	/** Memoized client — the token is resolved on first use, not at plugin load. */
	rest: () => ChecklyRestClient;
}

export function createContext(options: ChecklyPluginOptions): PluginContext {
	let rest: ChecklyRestClient | undefined;
	return {
		options,
		rest: () => {
			if (rest) return rest;
			const restOpts: { token: string; accountId: string; baseUrl?: string; fetch?: typeof fetch } = {
				token: resolveToken(options),
				accountId: options.accountId,
			};
			if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl;
			if (options.fetch !== undefined) restOpts.fetch = options.fetch;
			return (rest = createChecklyRestClient(restOpts));
		},
	};
}

export function monitoring(ctx: PluginContext): Monitoring {
	return new ChecklyMonitoring(ctx.rest, { checks: ctx.options.checks });
}

export function createPlugin(options: ChecklyPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-checkly",
		capabilities: {
			monitoring: () => monitoring(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set checkly` when no token
 * is supplied or the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate a Checkly API key at https://app.checklyhq.com/settings/user/api-keys, " +
	"then run: holocron auth set checkly <KEY>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { ChecklyMonitoring } from "./capabilities/monitoring.js";
export { type ChecklyRestClient, createChecklyRestClient } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
