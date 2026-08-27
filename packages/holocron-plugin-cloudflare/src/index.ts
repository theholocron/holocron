import type { Deployment, Dns } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { CloudflareDeployment } from "./capabilities/deployment.js";
import { CloudflareDns } from "./capabilities/dns.js";
import { type CloudflareClient, createCloudflareClient } from "./rest.js";

export interface CloudflarePluginOptions extends ResolveTokenInput {
	/**
	 * Cloudflare account ID. Required for Pages (deployment) operations;
	 * optional for DNS-only use.
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

export function deployment(ctx: PluginContext): Deployment {
	if (!ctx.options.accountId) {
		throw new Error(
			"Cloudflare accountId is required for Pages deployments — " +
				"set accountId in the plugin options or CLOUDFLARE_ACCOUNT_ID env var"
		);
	}
	return new CloudflareDeployment(ctx.client, ctx.options.accountId);
}

export function createPlugin(options: CloudflarePluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-cloudflare",
		capabilities: {
			dns: () => dns(ctx),
			...(ctx.options.accountId ? { deployment: () => deployment(ctx) } : {}),
		},
	};
}

export const AUTH_HINT =
	"create an API token at https://dash.cloudflare.com/profile/api-tokens " +
	"with Zone:Read, DNS:Edit, and Cloudflare Pages:Edit permissions, " +
	"then run: holocron auth set cloudflare <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { CloudflareDeployment } from "./capabilities/deployment.js";
export { CloudflareDns } from "./capabilities/dns.js";
export { type CloudflareClient, type CloudflareClientOptions, createCloudflareClient } from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
