/** One entry of a folder, as {@link IdeasIo.readDir} reports it. */
export interface IdeasDirEntry {
	/** The entry's name, without its folder. */
	name: string;
	/** Whether it is a folder. */
	directory: boolean;
}

/** What the Obsidian provider reads and writes on disk, so a test can supply it without a disk. */
export interface IdeasIo {
	/** The entries of a folder, or `undefined` when it does not exist or cannot be read. */
	readDir(path: string): IdeasDirEntry[] | undefined;
	/** A file's text, or `undefined` when it cannot be read. */
	read(path: string): string | undefined;
	/** Replaces a file's text. Throws when the file cannot be written. */
	write(path: string, text: string): void;
	/** The home folder, for a `dir` that starts with `~`. */
	home(): string;
}

/** What {@link parseNote} finds in one note. */
export interface ParsedNote {
	/** The `status:` property, without quotes; empty when there is none. */
	status: string;
	/** The `issue:` property, without quotes; empty when there is none or it is blank. */
	issue: string;
	/** The first `#` heading, else the file name without `.md`. */
	title: string;
	/** The note text without its frontmatter. */
	body: string;
	/** The embedded files an issue body cannot carry (`![[x.png]]`, `![](x.png)`), as written. */
	attachments: string[];
}
