/**
 * `@theholocron/holocron-plugin-obsidian` — entrypoint.
 *
 * Implements the `ideas` capability over an Obsidian vault: a folder of Markdown notes whose `status:` property is the
 * idea's state and whose `issue:` property records the issue it was filed as. `holocron ideas sync` loads this plugin
 * when `providers.ideas: ["obsidian", { dir }]` is declared in `holocron.config.ts` (or, for a config that still has
 * only `ideas.dir`, as if it were).
 *
 * The plugin reads and writes files and nothing else: there is no token and no network, so it has no `auth.ts`.
 */

import type { Ideas } from "@theholocron/cli";

import { ObsidianIdeas, type ObsidianIdeasOptions } from "./capabilities/ideas.js";
import { realIdeasIo } from "./real-ideas-io.js";

export type { ObsidianIdeasOptions } from "./capabilities/ideas.js";
export { ObsidianIdeas } from "./capabilities/ideas.js";
export type { IdeasDirEntry, IdeasIo } from "./ideas-io.type.js";

/** Options for the Obsidian plugin; the same as the `ideas` capability's. */
export type ObsidianPluginOptions = ObsidianIdeasOptions;

/** Builds the `ideas` capability from the plugin options. */
export function ideas(options: ObsidianPluginOptions): Ideas {
	return new ObsidianIdeas(options, options.io ?? realIdeasIo());
}

/** Creates the Obsidian plugin: the `ideas` capability. It has no probes, because there is nothing remote to poke. */
export function createPlugin(options: ObsidianPluginOptions = {}) {
	return {
		name: "@theholocron/holocron-plugin-obsidian",
		capabilities: {
			ideas: () => ideas(options),
		},
	};
}
