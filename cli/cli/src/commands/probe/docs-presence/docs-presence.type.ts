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
