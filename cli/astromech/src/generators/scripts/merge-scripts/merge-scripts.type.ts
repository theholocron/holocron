/** The scripts of a `package.json` after the generated ones are merged in. */
export interface MergedScripts {
	/** `existing` with the generated scripts set. */
	scripts: Record<string, string>;
	/** The names that were added or rewritten, sorted. */
	changed: string[];
}
