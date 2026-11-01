/** A `[skip docs]` marker found in a PR description or commit message. */
export interface SkipDocs {
	/** The packages it names (`[skip docs: array-utils]`), or `null` for every package. */
	scope: string[] | null;
	/** What follows the marker on its line; empty when the marker gives no reason, which does not count. */
	reason: string;
}

/** What the docs-presence probe reads from git, the filesystem and the environment, so a test can supply all three. */
export interface DocsPresenceIo {
	/** The environment: `BASE_SHA`, and `PR_TITLE` / `PR_BODY` when the workflow passes them. */
	env: Record<string, string | undefined>;
	/** The files the PR added, against `base`. Throws when git cannot say. */
	addedFiles(base: string): string[];
	/** Every file the PR changed, against `base`. Throws when git cannot say. */
	changedFiles(base: string): string[];
	/** The subject line of each commit in the PR. Empty when git cannot say. */
	subjects(base: string): string[];
	/** The full message of each commit in the PR, joined. Empty when git cannot say. */
	messages(base: string): string;
	/** The unified diff of one package's source against `base`. Empty when git cannot say. */
	diffOf(base: string, dir: string): string;
	/** A package folder's `package.json`, or `undefined` when it has none or it cannot be read. */
	readPackage(dir: string): { private?: boolean } | undefined;
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
