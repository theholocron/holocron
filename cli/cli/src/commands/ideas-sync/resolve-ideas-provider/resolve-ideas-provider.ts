import { holocronEnv } from "@theholocron/env-utils/lookup";

import {
	type ResolvedHolocronConfig,
	type ResolvedProviderEntry,
	resolvePluginPackage,
} from "../../../config/index.js";

/**
 * The `ideas` provider `ideas sync` reads through: `providers.ideas` when the config names one. A config written
 * before the capability has only `ideas.dir` (#2004), so that, or `HOLOCRON_IDEAS_DIR` alone, reads as
 * `["obsidian", { dir }]`, the way a `HOLOCRON_` variable falls back to the bare name. `providers.ideas` wins over
 * `ideas.dir`. `undefined` when the config names no place for ideas at all.
 */
export function resolveIdeasProvider(
	resolved: ResolvedHolocronConfig,
	env?: Record<string, string | undefined>
): ResolvedProviderEntry | undefined {
	const own = resolved.providers.ideas;
	if (own) return own;
	const dir = resolved.ideas?.dir;
	if (dir === undefined && holocronEnv(env).get("IDEAS_DIR") === undefined) return undefined;
	return {
		cardinality: "single",
		tuple: {
			provider: "obsidian",
			packageName: resolvePluginPackage("obsidian"),
			options: dir === undefined ? {} : { dir },
		},
	};
}
