/** A config file's content fetched from somewhere other than the local disk. */
export interface ConfigSource {
	/** The file name probed, e.g. `holocron.config.ts` — relative, as `fetch` was asked for it. */
	path: string;
	/** Which extension matched — what {@link loadConfigFromContent} needs as `extension`. */
	extension: string;
	/** The raw file content. */
	content: string;
}

/** Options for fetching a config file's content from a remote source. */
export interface ReadConfigSourceOptions {
	/** Base name — `"holocron"` probes `holocron.config.{ts,js,mjs,cjs,json}`. */
	name: string;
	/**
	 * Fetches one file by relative path (`holocron.config.ts`): its content, or
	 * `undefined` when it doesn't exist. Throw for anything else (a network
	 * failure, a permission error) — that propagates rather than reading as "absent".
	 */
	fetch: (path: string) => Promise<string | undefined>;
	/** Override the extension probe order. */
	extensions?: readonly string[];
}
