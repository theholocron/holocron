/**
 * `@theholocron/holocron-plugin-checkly` — entrypoint.
 *
 * Implements the `monitoring` capability against Checkly's REST API.
 * Also exports `verifyToken` + `AUTH_HINT` for `holocron check token`. See
 * README for auth + config docs.
 */

import type {
	Monitoring,
	MonitoringCheckInput,
	MonitoringDashboardInput,
	MonitoringHeartbeatInput,
	MonitoringStatusPageInput,
} from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { ChecklyMonitoring } from "./capabilities/monitoring.js";
import { checklyProbes } from "./probes/index.js";
import { tokenProbe } from "./probes/token/token.js";
import { type ChecklyClient, createChecklyClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Checkly plugin, including how its API key is resolved. */
export interface ChecklyPluginOptions extends ResolveTokenInput {
	/** Checkly account id — required on every request, not a secret (same status as Vercel's teamId). */
	accountId: string;
	/** Checks `holocron setup` should ensure exist. */
	checks?: MonitoringCheckInput[];
	/** Dashboards `holocron setup` should ensure exist, private unless a declaration says otherwise. */
	dashboards?: MonitoringDashboardInput[];
	/** Status pages `holocron setup` should ensure exist, with their components and rules. */
	statusPages?: MonitoringStatusPageInput[];
	/** Heartbeats `holocron setup` should ensure exist; the ping URL of each is handed to the private import file. */
	heartbeats?: MonitoringHeartbeatInput[];
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** The shared state the Checkly plugin's capabilities and probes are built from. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: ChecklyPluginOptions;
	/** Memoized client — the token is resolved on first use, not at plugin load. */
	client: () => ChecklyClient;
}

/** Builds the plugin context from its options; the API key is resolved lazily on the first client use. */
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

/** Builds the `monitoring` capability for a context, passing it the configured checks. */
export function monitoring(ctx: PluginContext): Monitoring {
	return new ChecklyMonitoring(ctx.client, {
		checks: ctx.options.checks,
		dashboards: ctx.options.dashboards,
		statusPages: ctx.options.statusPages,
		heartbeats: ctx.options.heartbeats,
	});
}

/** Creates the Checkly plugin: its `monitoring` capability and its `connection` and Checkly probes. */
export function createPlugin(options: ChecklyPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-checkly",
		probes: {
			...checklyProbes({ client: ctx.client, checks: options.checks }),
			token: tokenProbe({ token: () => resolveToken(options), client: ctx.client }),
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
 * One-line hint printed by `holocron new token checkly` when no token
 * is supplied or the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate a Checkly API key at https://app.checklyhq.com/settings/user/api-keys, " +
	"then run: holocron new token checkly <KEY>";

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
	type Dashboard,
	type DashboardInput,
	type Heartbeat,
	type HeartbeatInput,
	type HeartbeatUnit,
	type HttpMethod,
	type ListChecksParams,
} from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
