export interface FindObsoleteWorkflowsInput {
	/** Every file in `.github/workflows`, by file name, with its text. */
	workflows: ReadonlyMap<string, string>;
	/** The file names this run writes. */
	written: ReadonlySet<string>;
	/** The package this run is for, as in its files' `# Source package:` line (`.` for the root). */
	pkgRelPath: string;
}
