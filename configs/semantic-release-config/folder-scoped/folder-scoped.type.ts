import type { commitFiles } from "../commit-files/index.js";

/** What the folder-scoped release plugin depends on, each replaceable in a test. */
export interface FolderScopedDeps {
	/**
	 * Loads a plugin module by specifier, resolved from `cwd` (the repo being released). Defaults to a
	 * dynamic `import()` of the module as `cwd` resolves it, which is how semantic-release loads its own plugins.
	 */
	load?: (specifier: string, cwd: string) => Promise<unknown>;
	/** Lists the files each commit changed. Defaults to `git diff-tree`. */
	listFiles?: typeof commitFiles;
}
