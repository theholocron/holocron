export interface WorkspacePackage {
	slug: string;
	name: string;
	/** The workspace root the package was discovered under (`packages`, `apps`, `clients`, ...). Defaults to `"packages"`. */
	dir?: string;
	/**
	 * Repo-relative directory, set when it is not `<dir>/<slug>` -- a package that
	 * is itself a workspace folder (`observability`) or sits deeper (`docs/theme`).
	 */
	path?: string;
}
