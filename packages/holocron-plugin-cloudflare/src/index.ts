import type { Dns } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { CloudflareDns } from "./capabilities/dns.js";
import { createCloudflareClient, type CloudflareClient } from "./rest.js";

export interface CloudflarePluginOptions extends ResolveTokenInput {
	/**
	 * Cloudflare account id. Optional for DNS operations; required only
	 * for account-scoped endpoints (tunnels, custom nameservers).
	 */
	accountId?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: CloudflarePluginOptions;
	client: CloudflareClient;
}

export function createContext(options: CloudflarePluginOptions = {}): PluginContext {
	const token = resolveToken(options);
	return {
		options,
		client: createCloudflareClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function dns(ctx: PluginContext): Dns {
	return new CloudflareDns(ctx.client);
}

export function createPlugin(options: CloudflarePluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-cloudflare",
		capabilities: {
			dns: () => dns(ctx),
		},
	};
}

export const AUTH_HINT =
	"create an API token at https://dash.cloudflare.com/profile/api-tokens " +
	"with Zone:Read and DNS:Edit permissions, " +
	"then run: holocron auth set cloudflare <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { CloudflareDns } from "./capabilities/dns.js";
export { createCloudflareClient, type CloudflareClient, type CloudflareClientOptions } from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
