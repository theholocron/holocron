/**
 * `@theholocron/holocron-plugin-vercel` — entrypoint.
 *
 * Implements the `deployment` capability against Vercel's REST API.
 * See README for auth + config docs.
 */

import type { Deployment } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { VercelDeployment } from "./capabilities/deployment.js";
import { createVercelClient, type VercelClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Vercel plugin: token resolution, team, defaults for new projects and test overrides. */
export interface VercelPluginOptions extends ResolveTokenInput {
	/** Vercel team id. Set when working with a team-owned project. */
	teamId?: string;
	/** Default framework slug for new project creates. Defaults to "nextjs". */
	defaultFramework?: string;
	/** Custom domain that `holocron repo setup` should attach to the Vercel project. */
	domain?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** What the plugin's capabilities share: the options and a lazily built client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: VercelPluginOptions;
	/** Builds the Vercel client on first call and reuses it; the token is resolved then, not at plugin load. */
	client: () => VercelClient;
}

/** Creates the shared context for the given options; no token is resolved until `client()` is first called. */
export function createContext(options: VercelPluginOptions = {}): PluginContext {
	let client: VercelClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createVercelClient({
				token: resolveToken(options),
				teamId: options.teamId,
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `deployment` capability from a plugin context, passing on `defaultFramework` and `domain` when set. */
export function deployment(ctx: PluginContext): Deployment {
	const opts: ConstructorParameters<typeof VercelDeployment>[1] = {};
	if (ctx.options.defaultFramework !== undefined) {
		opts.defaultFramework = ctx.options.defaultFramework;
	}
	if (ctx.options.domain !== undefined) {
		opts.domain = ctx.options.domain;
	}
	return new VercelDeployment(ctx.client, opts);
}

/** Creates the Vercel plugin: a `connection` probe and the `deployment` capability. */
export function createPlugin(options: VercelPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-vercel",
		probes: {
			connection: connectionProbe({
				provider: "Vercel",
				url: options.baseUrl ?? "https://api.vercel.com",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
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
export { VercelDeployment } from "./capabilities/deployment.js";
export type { VercelClient } from "./rest.js";
export { createVercelClient, type VercelClientOptions } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
