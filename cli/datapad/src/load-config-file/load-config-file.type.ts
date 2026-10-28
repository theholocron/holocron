export interface LoadConfigFileOptions {
	/** Directory to start looking in. */
	cwd: string;
	/** Base name — `"holocron"` resolves `holocron.config.{ts,js,mjs,cjs,json}`. */
	name: string;
	/** Override the extension probe order. */
	extensions?: readonly string[];
	/**
	 * Walk upward through ancestor directories when `cwd` itself has no
	 * match, stopping at the first directory containing a `.git` entry (that
	 * directory is still searched before stopping) or the filesystem root.
	 * Off by default — exact-`cwd`-only, unchanged behavior for any existing
	 * caller that doesn't pass this.
	 */
	walkUp?: boolean;
}

export interface Loaded<T> {
	config: T;
	/** Absolute path of the file the value came from. */
	filepath: string;
}
