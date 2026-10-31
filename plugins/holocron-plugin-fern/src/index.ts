/**
 * `@theholocron/holocron-plugin-fern` — entrypoint.
 *
 * Implements the `wiki` capability using Fern (buildwithfern.com).
 * `holocron repo setup` loads this plugin when `providers.wiki: "fern"` is
 * declared in `holocron.config.ts` and calls `wiki.provision()` to write
 * `fern/fern.config.json` and a `fern/docs.yml` scaffold.
 *
 * The Fern CLI token (`FERN_TOKEN`) is only required in CI (via the
 * `wiki.yml` reusable workflow) — local setup writes config files only.
 */

import type { Wiki } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken } from "./auth.js";
import { FernWiki, type FernWikiOptions } from "./capabilities/wiki.js";

export type { ResolveTokenInput } from "./auth.js";
export { AuthError, resolveToken, tokens } from "./auth.js";
export type { FernWikiOptions } from "./capabilities/wiki.js";
export { FernWiki } from "./capabilities/wiki.js";
export { FERN_VERSION } from "./capabilities/wiki.js";

/** Options for the Fern plugin; the same as the `wiki` capability's. */
export type FernPluginOptions = FernWikiOptions;

/** Builds the `wiki` capability from the plugin options. */
export function wiki(opts: FernPluginOptions): Wiki {
	return new FernWiki(opts);
}

/** Creates the Fern plugin: its `connection` probe and the `wiki` capability. */
export function createPlugin(options: FernPluginOptions = {}) {
	return {
		name: "@theholocron/holocron-plugin-fern",
		probes: {
			// Fern has no endpoint for asking about a token, and only CI needs one, so this checks that there is one to use.
			connection: connectionProbe({
				provider: "Fern",
				token: () => resolveToken(options),
				verify: async () => ({ ok: true, subject: "a token is set (Fern cannot check it from here)" }),
			}),
		},
		capabilities: {
			wiki: () => wiki(options),
		},
	};
}
