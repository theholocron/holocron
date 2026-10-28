import type { commitFiles } from "../commit-files/index.js";

export interface FolderScopedDeps {
	/** Loads a plugin module by specifier. Defaults to a dynamic `import()`. */
	load?: (specifier: string) => Promise<unknown>;
	/** Lists the files each commit changed. Defaults to `git diff-tree`. */
	listFiles?: typeof commitFiles;
}
