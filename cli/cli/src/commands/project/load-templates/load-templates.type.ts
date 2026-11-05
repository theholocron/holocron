import type { BoardTemplate } from "../../../plugin/index.js";

/** The file system {@link loadTemplates} reads, so a test needs no disk. */
export interface TemplatesIo {
	/** The file names in a directory, or an empty list when it does not exist. */
	listFiles(dir: string): Promise<string[]>;
	/** A file's text. */
	readFile(path: string): Promise<string>;
}

/** What {@link loadTemplates} found. */
export interface LoadedTemplates {
	/** Every template by name: the built-ins, with a repo's own of the same name replacing one. */
	templates: Record<string, BoardTemplate>;
	/** What was wrong with a file, one line each, naming the file. A file with a problem is left out. */
	problems: string[];
}
