/**
 * `@theholocron/holocron-plugin-neon` — entrypoint.
 *
 * Implements the `storage` capability against Neon's REST API. See
 * README for auth + config docs.
 */

import type { Storage } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { NeonStorage } from "./capabilities/storage.js";
import { createNeonClient, type NeonClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Neon plugin: the token lookup inputs plus the project it is bound to. */
export interface NeonPluginOptions extends ResolveTokenInput {
	/** Neon project id this plugin is bound to. Required. */
	projectId: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** Shared state for one Neon plugin instance: its options and a lazily created client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: NeonPluginOptions;
	/** Returns the memoized Neon client; the token is resolved on the first call, not at plugin load. */
	client: () => NeonClient;
}

/** Builds the plugin context from its options; throws when `projectId` is missing. */
export function createContext(options: NeonPluginOptions): PluginContext {
	if (!options.projectId) {
		throw new Error("@theholocron/holocron-plugin-neon requires `projectId` in options");
	}
	let client: NeonClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createNeonClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `storage` capability for the context's project. */
export function storage(ctx: PluginContext): Storage {
	return new NeonStorage(ctx.client, { projectId: ctx.options.projectId });
}

/** Creates the Neon plugin: its `connection` probe and the `storage` capability. */
export function createPlugin(options: NeonPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-neon",
		probes: {
			connection: connectionProbe({
				provider: "Neon",
				url: options.baseUrl ?? "https://console.neon.tech",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
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
export { NeonStorage } from "./capabilities/storage.js";
export type { NeonClient } from "./rest.js";
export { createNeonClient, type NeonClientOptions } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
