/** A file the `tasks names` probe reads. */
export interface ScannedFile {
	/** Repo-relative, with `/` separators. */
	path: string;
	text: string;
}

/** One use of an old task name. */
export interface Leftover {
	file: string;
	/** 1-based. */
	line: number;
	/** The old dotted name found. */
	old: string;
	/** The flat id (or ids) that replaces it. */
	replacement: string;
}

/** What the `tasks names` probe reads from the repo, so a test can supply it without a disk. */
export interface TasksIo {
	/** The hand-written files to scan. */
	files(): ScannedFile[];
}

/** What `findLeftovers` is asked to include. */
export interface FindOptions {
	/** Also report an old name that is part of a workflow file name (`delivery.build.yml`). Off by default: until workflow files are renamed it is a file name, not a task. */
	files?: boolean;
}

/** One key of a JSON object and the 1-based line it is written on. */
export interface KeyLine {
	key: string;
	line: number;
}
