/** One area file's content fetched from somewhere other than the local disk. */
export interface ConfigDirSource {
	/** The area's name, as passed in `areas` — `"notifications"` for `.holocron/notifications.ts`. */
	area: string;
	/** The file path probed, relative as `fetch` was asked for it, e.g. `.holocron/notifications.ts`. */
	path: string;
	/** Which extension matched. */
	extension: string;
	/** The raw file content. */
	content: string;
}

/** Options for fetching the area files of a config directory from a remote source. */
export interface ReadConfigDirSourceOptions {
	/** The directory the areas live in, relative to the config: `".holocron"`. */
	dir: string;
	/** The closed list of area names to look for: `["notifications", "repo"]` probes `<dir>/notifications.*` and `<dir>/repo.*`. */
	areas: readonly string[];
	/**
	 * Fetches one file by relative path (`.holocron/notifications.ts`): its content, or `undefined` when it doesn't
	 * exist. Throw for anything else (a network failure, a permission error) — that propagates rather than reading
	 * as "absent".
	 */
	fetch: (path: string) => Promise<string | undefined>;
	/** Override the extension probe order. */
	extensions?: readonly string[];
}
