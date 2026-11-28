/**
 * `@theholocron/holocron-plugin-turbo` — entrypoint.
 *
 * Implements the `cache` capability for Turborepo's remote cache, which Vercel serves. See README for auth + config
 * docs.
 */

import type { Cache } from "@theholocron/cli";
import { resolveValue } from "@theholocron/cli";
import { PREFIX } from "@theholocron/env-utils/lookup";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { TurboCache } from "./capabilities/cache.js";
import { tokenProbe } from "./probes/token/token.js";
import { createTurboClient, type TurboClient } from "./rest.js";

/** Options for the Turbo plugin: token resolution, the team and test overrides. */
export interface TurboPluginOptions extends ResolveTokenInput {
	/**
	 * The team whose remote cache is checked: a Vercel team slug (what Turborepo reads as `TURBO_TEAM`) or a `team_...`
	 * id. Defaults to `HOLOCRON_TURBO_TEAM`, then `TURBO_TEAM`, which are not secrets.
	 */
	team?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** What the plugin's capability and probe share: the options, the team and a lazily built client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: TurboPluginOptions;
	/** The configured team, read when called: the option, then `HOLOCRON_TURBO_TEAM` / `TURBO_TEAM`; `undefined` when none. */
	team: () => string | undefined;
	/** The resolved token; throws an `AuthError` when none is set. */
	token: () => string;
	/** Builds the client on first call and reuses it; the token is resolved then, not at plugin load. */
	client: () => TurboClient;
}

/** Creates the shared context for the given options; no token or team is resolved until one is asked for. */
export function createContext(options: TurboPluginOptions = {}): PluginContext {
	let client: TurboClient | undefined;
	const token = () => resolveToken(options);
	return {
		options,
		token,
		team: () => options.team ?? resolveValue(["TURBO_TEAM"], options.env, { prefix: PREFIX }),
		client: () =>
			(client ??= createTurboClient({ token: token(), baseUrl: options.baseUrl, fetch: options.fetch })),
	};
}

/** Builds the `cache` capability from a plugin context. */
export function cache(ctx: PluginContext): Cache {
	return new TurboCache(ctx.client, ctx.team);
}

/** Creates the Turbo plugin: the `token` probe and the `cache` capability. */
export function createPlugin(options: TurboPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-turbo",
		probes: {
			token: tokenProbe({ cache: () => cache(ctx), team: ctx.team, token: ctx.token }),
		},
		capabilities: {
			cache: () => cache(ctx),
		},
	};
}

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { NO_TEAM, TurboCache } from "./capabilities/cache.js";
export { createTurboClient, type TurboClient, type TurboClientOptions } from "./rest.js";
