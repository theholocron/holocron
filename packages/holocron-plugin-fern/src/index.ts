/**
 * `@theholocron/holocron-plugin-fern` — entrypoint.
 *
 * Implements the `wiki` capability using Fern (buildwithfern.com).
 * `holocron setup` loads this plugin when `providers.wiki: "fern"` is
 * declared in `holocron.config.ts` and calls `wiki.provision()` to write
 * `fern/fern.config.json` and a `fern/docs.yml` scaffold.
 *
 * The Fern CLI token (`FERN_TOKEN`) is only required in CI (via the
 * `wiki.yml` reusable workflow) — local setup writes config files only.
 */

import type { Wiki } from "@theholocron/cli";

import { FernWiki, type FernWikiOptions } from "./capabilities/wiki.js";

export type { ResolveTokenInput } from "./auth.js";
export { AuthError, resolveToken } from "./auth.js";
export type { FernWikiOptions } from "./capabilities/wiki.js";
export { FernWiki } from "./capabilities/wiki.js";
export { FERN_VERSION } from "./capabilities/wiki.js";

export type FernPluginOptions = FernWikiOptions;

export function wiki(opts: FernPluginOptions): Wiki {
	return new FernWiki(opts);
}

export function createPlugin(options: FernPluginOptions = {}) {
	return {
		name: "@theholocron/holocron-plugin-fern",
		capabilities: {
			wiki: () => wiki(options),
		},
	};
}
