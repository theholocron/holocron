/** A `[skip docs]` marker found in a PR description or commit message. */
export interface SkipDocs {
	/** The packages it names (`[skip docs: array-utils]`), or `null` for every package. */
	scope: string[] | null;
	/** What follows the marker on its line; empty when the marker gives no reason, which does not count. */
	reason: string;
}

/** What the docs-presence check found for the packages a feature changed. */
export interface DocsPresenceResult {
	/** Packages with no docs signal and no `[skip docs]` reason. */
	warn: string[];
	/** Packages a `[skip docs]` marker with a reason covered. */
	skipped: Array<{ dir: string; reason: string }>;
	/** A marker covered a package but gave no reason, so the package is in `warn`. */
	missingReason: boolean;
}
