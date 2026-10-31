/** Options for loading a config from raw content rather than a file already on disk. */
export interface LoadConfigFromContentOptions {
	/**
	 * Directory to write `<name>.config.<extension>` into before loading —
	 * this is what upward `node_modules` resolution sees, so a config that
	 * does `import { defineConfig } from "@theholocron/cli"` only resolves
	 * if `dir` sits under a tree where that package is a real dependency.
	 * Callers own creating and cleaning up `dir` — this function only
	 * writes the one file into it.
	 */
	dir: string;
	/** Raw file content — not necessarily sourced from a local file at all (a network fetch, a git blob, …). */
	content: string;
	/** Base name — `"holocron"` writes `holocron.config.<extension>`. */
	name: string;
	/** Which of `DEFAULT_EXTENSIONS` `content` is — determines how it's interpreted (ts/js/mjs/cjs parsed as a module, json as `JSON.parse`). */
	extension: string;
}
