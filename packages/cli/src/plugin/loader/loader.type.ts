import type { CapabilityKey } from "../capabilities/index.js";
import type { PluginProbes } from "../probe/index.js";

/**
 * Per-invocation context every plugin receives, on top of its own
 * config-time options. Kept intentionally narrow.
 */
export interface RuntimeContext {
	/** "owner/name" — the repo this invocation is operating on. */
	repo?: string;
	/** Absolute path to the working repo root. */
	repoRoot: string;
	/**
	 * When true, commands print what they WOULD mutate instead of
	 * actually calling capability mutators. Set by the global
	 * `--dry-run` flag. Capabilities themselves are unaware — the check
	 * lives at the command layer.
	 */
	dryRun?: boolean;
	/**
	 * Token passed via bare `--token <value>`. Used as fallback for all
	 * plugins when no matching entry exists in `cliTokens`.
	 */
	cliToken?: string;
	/**
	 * Per-provider tokens from `--token vendor=value` pairs. The loader
	 * routes each entry to the matching plugin (by `tuple.provider`) as
	 * its `cliToken`, falling back to `cliToken` for unmatched providers.
	 * Plugins never receive this map — they always see a single `cliToken`.
	 */
	cliTokens?: Record<string, string>;
	/**
	 * Active org name for namespaced keyring lookup. Resolved from
	 * `--org` flag → `HOLOCRON_ORG` env var → `org` in config, then
	 * injected here so plugins receive it via their options
	 * (which extend `ResolveTokenInput`) without any per-plugin change.
	 */
	org?: string;
}

/**
 * The shape every plugin's default-or-named export must satisfy:
 * `createPlugin(opts)` returns an object with capability factories.
 */
export interface LoadedPlugin {
	name: string;
	/** Things to poke at on demand (`holocron probe <provider> <probe>`); optional. */
	probes?: PluginProbes;
	capabilities: Partial<{
		[K in CapabilityKey]: () => unknown;
	}>;
}

export interface PluginModule {
	createPlugin: (opts: Record<string, unknown>) => LoadedPlugin;
}

/** Returns `unknown` — the loader type-narrows inside `loadOne`. */
export type PluginImporter = (packageName: string) => Promise<unknown>;

/** A provider that could not be loaded — missing token, bad package, unimplemented capability. */
export interface PluginLoadFailure {
	key: CapabilityKey;
	provider: string;
	packageName: string;
	error: Error;
}
