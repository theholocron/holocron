/**
 * `@theholocron/holocron-plugin-checkly` — entrypoint.
 *
 * Implements the `monitoring` capability against Checkly's REST API.
 * Also exports `verifyToken` + `AUTH_HINT` for `holocron auth`. See
 * README for auth + config docs.
 */

import type { Monitoring, MonitoringCheckInput } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { ChecklyMonitoring } from "./capabilities/monitoring.js";
import { checklyProbes } from "./probes/index.js";
import { type ChecklyClient, createChecklyClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

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
	client: () => ChecklyClient;
}

export function createContext(options: ChecklyPluginOptions): PluginContext {
	let client: ChecklyClient | undefined;
	return {
		options,
		client: () => {
			if (client) return client;
			const clientOpts: { token: string; accountId: string; baseUrl?: string; fetch?: typeof fetch } = {
				token: resolveToken(options),
				accountId: options.accountId,
			};
			if (options.baseUrl !== undefined) clientOpts.baseUrl = options.baseUrl;
			if (options.fetch !== undefined) clientOpts.fetch = options.fetch;
			return (client = createChecklyClient(clientOpts));
		},
	};
}

export function monitoring(ctx: PluginContext): Monitoring {
	return new ChecklyMonitoring(ctx.client, { checks: ctx.options.checks });
}

export function createPlugin(options: ChecklyPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-checkly",
		probes: {
			...checklyProbes({ client: ctx.client }),
			connection: connectionProbe({
				provider: "Checkly",
				url: options.baseUrl ?? "https://api.checklyhq.com",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
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
export {
	type ApiCheck,
	type ApiCheckInput,
	type ApiCheckRequest,
	type Assertion,
	type AssertionComparison,
	type AssertionSource,
	type ChecklyClient,
	type ChecklyClientOptions,
	createChecklyClient,
	type HttpMethod,
	type ListChecksParams,
} from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
