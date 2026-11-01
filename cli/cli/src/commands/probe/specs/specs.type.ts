/** What the `specs check` probe reads from the filesystem, so a test can supply it without a disk. */
export interface SpecsIo {
	/** The names of the files in a repo-relative folder, in any order; empty when the folder is missing. */
	list(dir: string): string[];
	/** A repo-relative file's text, or `undefined` when it does not exist or cannot be read (a folder, a moved-away file). */
	read(path: string): string | undefined;
	/** A path as the person typed it (relative to the working folder, or absolute) as a repo-relative path with `/` separators. */
	repoPath(arg: string): string;
}

/** What the `specs announce` probe reads from git and the environment, and where it writes its outputs, so a test can supply all three. */
export interface SpecsAnnounceIo {
	/** The environment: `SPEC_EVENT`, `BEFORE_SHA`, `AFTER_SHA`, `PR_NUMBER` and `PR_URL`. */
	env: Record<string, string | undefined>;
	/** The paths that differ between two revisions, including ones the later revision removed. Throws when git cannot say. */
	changedFiles(before: string, after: string): string[];
	/** A file's text at a revision, or `undefined` when the revision has no such file. */
	readAt(rev: string, path: string): string | undefined;
	/** Sets a step output for the workflow to read. Does nothing outside GitHub Actions. */
	setOutput(name: string, value: string): void;
}
