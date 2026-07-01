/**
 * `@theholocron/holocron-plugin-vercel` — entrypoint.
 *
 * Implements the `deployment` capability against Vercel's REST API.
 * See README for auth + config docs.
 */

import type { Deployment } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { VercelDeployment } from "./capabilities/deployment.js";
import { VercelRestClient } from "./rest.js";

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
	rest: VercelRestClient;
}

export function createContext(options: VercelPluginOptions = {}): PluginContext {
	const token = resolveToken(options);
	const restOpts: ConstructorParameters<typeof VercelRestClient>[0] = { token };
	if (options.teamId !== undefined) restOpts.teamId = options.teamId;
	if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl;
	if (options.fetch !== undefined) restOpts.fetch = options.fetch;
	return {
		options,
		rest: new VercelRestClient(restOpts),
	};
}

export function deployment(ctx: PluginContext): Deployment {
	const opts: ConstructorParameters<typeof VercelDeployment>[1] = {};
	if (ctx.options.defaultFramework !== undefined) {
		opts.defaultFramework = ctx.options.defaultFramework;
	}
	return new VercelDeployment(ctx.rest, opts);
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

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { VercelRestClient } from "./rest.js";
export { VercelDeployment } from "./capabilities/deployment.js";
