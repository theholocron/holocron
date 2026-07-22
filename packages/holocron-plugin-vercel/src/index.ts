/**
 * `@theholocron/holocron-plugin-vercel` — entrypoint.
 *
 * Implements the `deployment` capability against Vercel's REST API.
 * See README for auth + config docs.
 */

import type { Deployment } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { VercelDeployment } from "./capabilities/deployment.js";
import { createVercelClient, type VercelClient } from "./rest.js";

export interface VercelPluginOptions extends ResolveTokenInput {
	/** Vercel team id. Set when working with a team-owned project. */
	teamId?: string;
	/** Default framework slug for new project creates. Defaults to "nextjs". */
	defaultFramework?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: VercelPluginOptions;
	client: VercelClient;
}

export function createContext(options: VercelPluginOptions = {}): PluginContext {
	const token = resolveToken(options);
	return {
		options,
		client: createVercelClient({
			token,
			teamId: options.teamId,
			baseUrl: options.baseUrl,
			fetch: options.fetch,
		}),
	};
}

export function deployment(ctx: PluginContext): Deployment {
	const opts: ConstructorParameters<typeof VercelDeployment>[1] = {};
	if (ctx.options.defaultFramework !== undefined) {
		opts.defaultFramework = ctx.options.defaultFramework;
	}
	return new VercelDeployment(ctx.client, opts);
}

export function createPlugin(options: VercelPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-vercel",
		capabilities: {
			deployment: () => deployment(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set vercel` when no token
 * is supplied or the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate a Vercel Personal Access Token at https://vercel.com/account/tokens " +
	"(scope: Full Account for team ops), then run: holocron auth set vercel <PAT>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { createVercelClient } from "./rest.js";
export type { VercelClient } from "./rest.js";
export { VercelDeployment } from "./capabilities/deployment.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
