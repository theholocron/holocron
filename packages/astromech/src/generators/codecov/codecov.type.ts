export interface WorkspacePackage {
	slug: string;
	name: string;
	/** Which workspace root the package was discovered under. Defaults to `"packages"`. */
	dir?: "packages" | "apps" | "plugins";
}
