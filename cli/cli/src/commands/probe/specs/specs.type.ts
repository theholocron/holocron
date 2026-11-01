/** What the `specs check` probe reads from the filesystem, so a test can supply it without a disk. */
export interface SpecsIo {
	/** The names of the files in a repo-relative folder, in any order; empty when the folder is missing. */
	list(dir: string): string[];
	/** A repo-relative file's text, or `undefined` when it does not exist or cannot be read (a folder, a moved-away file). */
	read(path: string): string | undefined;
	/** A path as the person typed it (relative to the working folder, or absolute) as a repo-relative path with `/` separators. */
	repoPath(arg: string): string;
}
