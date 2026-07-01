/**
 * `@theholocron/holocron-plugin-neon` — entrypoint.
 *
 * Implements the `storage` capability against Neon's REST API. See
 * README for auth + config docs.
 */

import type { Storage } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { NeonStorage } from "./capabilities/storage.js";
import { NeonRestClient } from "./rest.js";

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
	rest: NeonRestClient;
}

export function createContext(options: NeonPluginOptions): PluginContext {
	if (!options.projectId) {
		throw new Error("@theholocron/holocron-plugin-neon requires `projectId` in options");
	}
	const token = resolveToken(options);
	const restOpts: ConstructorParameters<typeof NeonRestClient>[0] = { token };
	if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl;
	if (options.fetch !== undefined) restOpts.fetch = options.fetch;
	return {
		options,
		rest: new NeonRestClient(restOpts),
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

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { NeonRestClient } from "./rest.js";
export { NeonStorage } from "./capabilities/storage.js";
