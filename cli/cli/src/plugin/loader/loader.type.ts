import type { PluginImporter as KyberPluginImporter } from "@theholocron/kyber/plugins";

import type { CapabilityImpls, CapabilityKey, CardinalityFor } from "../capabilities/index.js";
import type { PluginProbes } from "../probe/index.js";
import type { ProviderAction } from "../provider-actions/index.js";

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

/** Holocron's capabilities as the shape kyber's plugin loader is typed by: each key's cardinality and interface. */
export type HolocronCapabilities = {
	[K in CapabilityKey]: { cardinality: CardinalityFor<K>; impl: CapabilityImpls[K] };
};

/** What a Holocron plugin carries next to its capabilities. */
export interface PluginExtras {
	/** Things to poke at on demand (`holocron probe <provider> <probe>`); optional. */
	probes?: PluginProbes;
	/** What only this provider has, applied from its config block (`holocron provider <name> setup`); optional. */
	setup?: ProviderAction;
	/** The read-only comparison of that block with the provider (`holocron provider <name> doctor`); optional. */
	doctor?: ProviderAction;
}

/** Returns `unknown` — the loader type-narrows inside `loadOne`. */
export type PluginImporter = KyberPluginImporter;

/** Options for {@link PluginLoader}. */
export interface PluginLoaderOptions {
	/**
	 * When `false`, the `credentials` providers are loaded but not asked for their variables, so no value is read
	 * into the process. `holocron doctor credentials` uses it: it only needs the providers' `inspect`. Default `true`.
	 */
	readCredentials?: boolean;
}
