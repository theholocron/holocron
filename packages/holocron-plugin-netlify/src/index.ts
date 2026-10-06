/**
 * `@theholocron/holocron-plugin-netlify` — entrypoint.
 *
 * Implements the `deployment` capability against Netlify's REST API.
 * Also exports `verifyToken` + `AUTH_HINT` for `holocron auth`. See
 * README for auth + config docs.
 */

import type { Deployment } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { NetlifyDeployment, type NetlifyDeploymentOptions } from "./capabilities/deployment.js";
import { createNetlifyRestClient, type NetlifyRestClient } from "./rest.js";

export interface NetlifyPluginOptions extends ResolveTokenInput, NetlifyDeploymentOptions {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: NetlifyPluginOptions;
	/** Memoized client — the token is resolved on first use, not at plugin load. */
	rest: () => NetlifyRestClient;
}

export function createContext(options: NetlifyPluginOptions): PluginContext {
	let rest: NetlifyRestClient | undefined;
	return {
		options,
		rest: () => {
			if (rest) return rest;
			const restOpts: { token: string; baseUrl?: string; fetch?: typeof fetch } = {
				token: resolveToken(options),
			};
			if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl;
			if (options.fetch !== undefined) restOpts.fetch = options.fetch;
			return (rest = createNetlifyRestClient(restOpts));
		},
	};
}

export function deployment(ctx: PluginContext): Deployment {
	const opts: NetlifyDeploymentOptions = {};
	if (ctx.options.accountSlug !== undefined) opts.accountSlug = ctx.options.accountSlug;
	if (ctx.options.accountId !== undefined) opts.accountId = ctx.options.accountId;
	if (ctx.options.domain !== undefined) opts.domain = ctx.options.domain;
	return new NetlifyDeployment(ctx.rest, opts);
}

export function createPlugin(options: NetlifyPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-netlify",
		capabilities: {
			deployment: () => deployment(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set netlify` when no token is
 * supplied or the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate a Netlify Personal Access Token at https://app.netlify.com/user/applications#personal-access-tokens, " +
	"then run: holocron auth set netlify <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { NetlifyDeployment, type NetlifyDeploymentOptions } from "./capabilities/deployment.js";
export { createNetlifyRestClient, type NetlifyRestClient } from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
