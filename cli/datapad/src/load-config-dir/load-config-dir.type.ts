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
}

/** Options for loading the area files of a config directory from disk. */
export interface LoadConfigDirOptions {
	/** The directory holding `dir` — normally the one the config file was found in. */
	cwd: string;
	/** The directory the areas live in, relative to `cwd`: `".holocron"`. */
	dir: string;
	/** The closed list of area names to look for. Files not named here are never read. */
	areas: readonly string[];
	/** Override the extension probe order. */
	extensions?: readonly string[];
}
