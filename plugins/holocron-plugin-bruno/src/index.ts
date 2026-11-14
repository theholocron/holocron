/**
 * `@theholocron/holocron-plugin-bruno` — entrypoint.
 *
 * Implements the `tooling` capability for Bruno over files: `holocron export requests` writes the repo's request
 * collections as OpenCollection YAML, which Bruno opens as a collection. Bruno has no HTTP API and no account to sync
 * to, so the plugin has no token and makes no network call, and so no `auth.ts`.
 */

import type { Tooling } from "@theholocron/cli";

import { BrunoTooling, type BrunoToolingOptions } from "./capabilities/tooling.js";

export type { BrunoToolingOptions } from "./capabilities/tooling.js";
export { BrunoTooling } from "./capabilities/tooling.js";
export type { ConvertedCollection } from "./convert-collection.js";
export { convertCollection } from "./convert-collection.js";
export { outputNames } from "./output-names.js";

/** Options for the Bruno plugin; the same as the `tooling` capability's. */
export type BrunoPluginOptions = BrunoToolingOptions;

/** Builds the `tooling` capability from the plugin options. */
export function tooling(options: BrunoPluginOptions): Tooling {
	return new BrunoTooling(options);
}

/** Creates the Bruno plugin: its `tooling` capability. It has no probes, because there is nothing remote to poke. */
export function createPlugin(options: BrunoPluginOptions = {}) {
	return {
		name: "@theholocron/holocron-plugin-bruno",
		capabilities: {
			tooling: () => tooling(options),
		},
	};
}
