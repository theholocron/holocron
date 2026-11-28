/** One area file loaded from a config directory. */
export interface ConfigDirArea<T = unknown> {
	/** The area's name, as passed in `areas`. */
	area: string;
	/** The file path relative to `cwd`, with `/` separators: `.holocron/notifications.ts`. */
	path: string;
	/** Which extension matched. */
	extension: string;
	/** Absolute path of the file. */
	filepath: string;
	/** The file's default export (`.ts`, `.js`, `.mjs`, `.cjs`) or its parsed content (`.json`). */
	value: T;
	/**
	 * The same area read from the repository root's directory, when this one is the config's own and the root has a
	 * file for it too. Only areas named in `shared` are looked up there. Absent when the root has no such file.
	 */
	root?: ConfigDirArea<T>;
}

/** Options for loading the area files of a config directory from disk. */
export interface LoadConfigDirOptions {
	/** The directory holding `dir` — normally the one the config file was found in. */
	cwd: string;
	/** The directory the areas live in, relative to `cwd`: `".holocron"`. */
	dir: string;
	/** The closed list of area names to look for. Files not named here are never read. */
	areas: readonly string[];
	/**
	 * Area names that are also read from the repository root's `dir` (the nearest ancestor of `cwd` with a `.git`
	 * entry, `cwd` itself first). A shared area with a file in both places comes back as the one in `cwd` with the
	 * root's as `root`; one that only the root has comes back as the root's file, its `path` relative to `cwd`. The
	 * caller decides how the two combine. When `cwd` is the root there is nothing to inherit.
	 */
	shared?: readonly string[];
	/** Override the extension probe order. */
	extensions?: readonly string[];
}
