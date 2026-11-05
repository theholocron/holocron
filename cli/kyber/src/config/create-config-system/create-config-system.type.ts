import type { Loaded } from "@theholocron/datapad";

import type { ConfigFragment, MergeStrategies } from "../compose-fragments/index.js";

/** What {@link createConfigSystem} needs to build a CLI's config system. */
export interface ConfigSystemOptions<Raw, Resolved, Composed> {
	/** The CLI's name; its config file is `<name>.config.{ts,js,mjs,cjs,json}`. */
	name: string;
	/** Fill in defaults on the loaded config (from `package.json`, git, other files) before it is resolved. */
	derive?: (found: Loaded<Raw>) => Raw | Promise<Raw>;
	/** Check the config and turn it into the shape the CLI works with; throw `ConfigError` when it is invalid. */
	resolve: (raw: Raw) => Resolved;
	/** How `compose()` merges each key of the fragments into one `Composed` object. */
	merge: MergeStrategies<Composed>;
}

/** A loaded and resolved config. */
export interface LoadedConfig<Resolved> {
	/** The config after `resolve`. */
	resolved: Resolved;
	/** Absolute path to the file the config was read from. */
	filepath: string;
}

/** The functions {@link createConfigSystem} returns. */
export interface ConfigSystem<Raw, Resolved, Fragment extends ConfigFragment, Composed> {
	/** Returns the config unchanged; it exists to type and autocomplete a config file. */
	defineConfig: (config: Raw) => Raw;
	/**
	 * Find, load, derive and resolve the config, starting at `cwd` and walking up to the nearest `.git`. Throws
	 * `ConfigFileError` when none is found or a file cannot be loaded, or whatever `resolve` throws.
	 */
	loadConfig: (cwd: string) => Promise<LoadedConfig<Resolved>>;
	/** Merge fragments (or arrays of them) into one object that spreads into `defineConfig()`. */
	compose: (...fragments: (Fragment | Fragment[])[]) => Composed;
}
