import type { ConfigDirArea, Loaded } from "@theholocron/datapad";

import type { ConfigFragment, MergeStrategies } from "../compose-fragments/index.js";

/** What {@link createConfigSystem} needs to build a CLI's config system. */
export interface ConfigSystemOptions<Raw, Resolved, Composed> {
	/** The CLI's name; its config file is `<name>.config.{ts,js,mjs,cjs,json}`. */
	name: string;
	/**
	 * The closed list of area names to read from the `.<name>/` directory beside the config (`.holocron/` for a CLI
	 * named `holocron`): `["notifications", "repo"]` reads `.holocron/notifications.{ts,js,mjs,cjs,json}` and
	 * `.holocron/repo.*`. Needs `place` to do anything with them. Files not on the list are never read.
	 */
	areas?: readonly string[];
	/**
	 * The areas of `areas` that a config in a subdirectory also reads from the repository root's directory (the
	 * nearest `.git`). Such an area reaches `place` as the config's own file with the root's as `root`, or as the
	 * root's file when the config has none; `place` decides how they combine. Default: none, so a config reads only
	 * the directory beside it.
	 */
	shared?: readonly string[];
	/**
	 * Put the loaded areas into the config, called after the config file is loaded and before `derive`, only when
	 * `areas` is set. `areas` holds one entry per area that has a file (none when the directory is missing), and `raw`
	 * is the config as loaded. Return the config with the areas placed; throw `ConfigError` when an area clashes with
	 * what the config already says (for example, a value set inline and in a file).
	 */
	place?: (areas: ConfigDirArea[], raw: Raw) => Raw | Promise<Raw>;
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
