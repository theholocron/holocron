/**
 * `@theholocron/holocron-plugin-neon` — entrypoint.
 *
 * Implements the `storage` capability against Neon's REST API. See
 * README for auth + config docs.
 */

import type { RestClient, Storage } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { NeonStorage } from "./capabilities/storage.js";
import { createNeonRestClient } from "./rest.js";

export interface NeonPluginOptions extends ResolveTokenInput {
	/** Neon project id this plugin is bound to. Required. */
	projectId: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: NeonPluginOptions;
	rest: RestClient;
}

export function createContext(options: NeonPluginOptions): PluginContext {
	if (!options.projectId) {
		throw new Error("@theholocron/holocron-plugin-neon requires `projectId` in options");
	}
	const token = resolveToken(options);
	return {
		options,
		rest: createNeonRestClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function storage(ctx: PluginContext): Storage {
	return new NeonStorage(ctx.rest, { projectId: ctx.options.projectId });
}

export function createPlugin(options: NeonPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-neon",
		capabilities: {
			storage: () => storage(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set neon` when no token
 * is supplied or the supplied token is rejected. Points operators
 * at https://console.neon.tech/app/settings/api-keys where API keys
 * are minted.
 */
export const AUTH_HINT =
	"generate a Neon API key at https://console.neon.tech/app/settings/api-keys, " +
	"then run: holocron auth set neon <KEY>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { createNeonRestClient } from "./rest.js";
export { NeonStorage } from "./capabilities/storage.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
