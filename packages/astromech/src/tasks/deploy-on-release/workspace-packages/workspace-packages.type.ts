/** A workspace package: absolute folder, and what its `package.json` says. */
export interface WorkspacePackage {
	name: string;
	dir: string;
	version: string | undefined;
	dependencies: Record<string, string>;
}

export interface Tree {
	readJson: (path: string) => unknown;
	listDirs: (path: string) => string[];
}
