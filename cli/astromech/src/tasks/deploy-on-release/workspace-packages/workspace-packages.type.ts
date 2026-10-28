/** A workspace package: absolute folder, and what its `package.json` says. */
export interface WorkspacePackage {
	name: string;
	dir: string;
	version: string | undefined;
	dependencies: Record<string, string>;
	/**
	 * A workspace:* devDependency can optionally count too (holocron#1071,
	 * workspaceDependencies' includeDevDependencies option). Optional so a
	 * caller holding the previous, dev-dependency-less shape (a plain
	 * object literal, or a value from outside this package's own version)
	 * keeps compiling and working -- a missing value is treated the same
	 * as `{}`.
	 */
	devDependencies?: Record<string, string>;
}

export interface Tree {
	readJson: (path: string) => unknown;
	listDirs: (path: string) => string[];
}
