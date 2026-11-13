import type { Deployment, Dns, Tunnels, Workers } from "@theholocron/cli";
import { connectionProbe, resolveValue } from "@theholocron/cli";
import { PREFIX } from "@theholocron/env-utils/lookup";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { CloudflareDeployment } from "./capabilities/deployment.js";
import { CloudflareDns } from "./capabilities/dns.js";
import { CloudflareTunnels } from "./capabilities/tunnels.js";
import { CloudflareWorkers } from "./capabilities/workers.js";
import { tokenProbe } from "./probes/token/token.js";
import { type CloudflareClient, createCloudflareClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Cloudflare plugin: how the API token is resolved, the account, and test overrides. */
export interface CloudflarePluginOptions extends ResolveTokenInput {
	/**
	 * Cloudflare account ID. Required for Pages (deployment) operations;
	 * optional for DNS-only use.
	 */
	accountId?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** The `fetch` to use instead of the global one, for tests. */
	fetch?: typeof fetch;
}

/** The shared state the Cloudflare plugin's capabilities and probes are built from. */
export interface PluginContext {
	/** The options the plugin was created with, with `accountId` falling back to `CLOUDFLARE_ACCOUNT_ID` in the environment, then in the `credentials` providers' variables. */
	options: CloudflarePluginOptions;
	/** Memoized client — the token is resolved on first use, not at plugin load. */
	client: () => CloudflareClient;
	/** Memoized token resolver — shared by the client and the Workers capability. */
	token: () => string;
}

/** Builds the plugin context from its options; the API token is resolved lazily on the first client use. */
export function createContext(options: CloudflarePluginOptions = {}): PluginContext {
	// HOLOCRON_CLOUDFLARE_ACCOUNT_ID, then the standard Cloudflare CLOUDFLARE_ACCOUNT_ID; fall back so `deployment: "cloudflare"` works without
	// repeating the ID in every config. The option wins, then the environment, then the variables the `credentials`
	// providers returned (a 1Password Environment), the same chain the token is found through.
	const accountId = options.accountId ?? resolveValue(["CLOUDFLARE_ACCOUNT_ID"], options.env, { prefix: PREFIX });
	const opts = { ...options, accountId };
	let token: string | undefined;
	let client: CloudflareClient | undefined;
	const resolve = () => (token ??= resolveToken(opts));
	return {
		options: opts,
		token: resolve,
		client: () =>
			(client ??= createCloudflareClient({ token: resolve(), baseUrl: opts.baseUrl, fetch: opts.fetch })),
	};
}

/** Builds the `dns` capability for a context. */
export function dns(ctx: PluginContext): Dns {
	return new CloudflareDns(ctx.client);
}

/** Builds the `deployment` capability for a context; throws when no account id is set. */
export function deployment(ctx: PluginContext): Deployment {
	if (!ctx.options.accountId) {
		throw new Error(
			"Cloudflare accountId is required for Pages deployments — " +
				"set accountId in the plugin options or CLOUDFLARE_ACCOUNT_ID env var"
		);
	}
	return new CloudflareDeployment(ctx.client, ctx.options.accountId);
}

/** Builds the `workers` capability for a context; throws when no account id is set. */
export function workersCapability(ctx: PluginContext): Workers {
	if (!ctx.options.accountId) {
		throw new Error(
			"Cloudflare accountId is required for Workers — " +
				"set accountId in the plugin options or CLOUDFLARE_ACCOUNT_ID env var"
		);
	}
	return new CloudflareWorkers(ctx.client, ctx.options.accountId);
}

/** Builds the `tunnels` capability for a context; throws when no account id is set. */
export function tunnelsCapability(ctx: PluginContext): Tunnels {
	if (!ctx.options.accountId) {
		throw new Error(
			"Cloudflare accountId is required for Tunnels — " +
				"set accountId in the plugin options or CLOUDFLARE_ACCOUNT_ID env var"
		);
	}
	return new CloudflareTunnels(ctx.client, ctx.options.accountId);
}

/** Creates the Cloudflare plugin: `dns` always, plus `deployment`, `workers` and `tunnels` when an account id is set, and the `connection` and `token` probes. */
export function createPlugin(options: CloudflarePluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-cloudflare",
		probes: {
			token: tokenProbe(ctx),
			connection: connectionProbe({
				provider: "Cloudflare",
				url: options.baseUrl ?? "https://api.cloudflare.com",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
		capabilities: {
			dns: () => dns(ctx),
			...(ctx.options.accountId
				? {
						deployment: () => deployment(ctx),
						workers: () => workersCapability(ctx),
						tunnels: () => tunnelsCapability(ctx),
					}
				: {}),
		},
	};
}

/** One-line hint printed by `holocron new token cloudflare` when no token is supplied or the supplied one is rejected. */
export const AUTH_HINT =
	"create an API token at https://dash.cloudflare.com/profile/api-tokens " +
	"with Zone:Read, DNS:Edit, Cloudflare Pages:Edit, Workers Scripts:Edit (account-level), " +
	"Workers Routes:Edit (zone-level) and, for tunnels, Cloudflare Tunnel:Edit (account-level) permissions, " +
	"then run: holocron new token cloudflare <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { CloudflareDeployment } from "./capabilities/deployment.js";
export { CloudflareDns } from "./capabilities/dns.js";
export { CloudflareTunnels } from "./capabilities/tunnels.js";
export { CloudflareWorkers } from "./capabilities/workers.js";
export { type CloudflareClient, type CloudflareClientOptions, createCloudflareClient } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
