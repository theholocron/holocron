/** One file of a config directory's tree, as fetched from a remote source. */
export interface ConfigDirFile {
	/** Path relative to the sandbox directory, e.g. `.holocron/notifications.ts` or `.holocron/lib/channels.ts`. */
	path: string;
	/** The raw file content. */
	content: string;
}

/** Options for writing a fetched config directory beside a config. */
export interface WriteConfigDirOptions {
	/** The sandbox directory (the `dir` given to {@link loadConfigFromContent}); `files` are written under it. */
	dir: string;
	/** The files to write; their relative paths (and so the sub-directories) are kept. */
	files: readonly ConfigDirFile[];
}
