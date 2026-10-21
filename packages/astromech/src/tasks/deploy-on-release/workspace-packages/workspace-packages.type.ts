/** A workspace package: absolute folder, and what its `package.json` says. */
export interface WorkspacePackage {
	name: string;
	dir: string;
	version: string | undefined;
	dependencies: Record<string, string>;
	/** A workspace:* devDependency still counts for the dependency traversal (holocron#1071) — a shared build-time-only package (tsconfig, lint config) can change what gets built even though it's never imported at runtime. */
	devDependencies: Record<string, string>;
}

export interface Tree {
	readJson: (path: string) => unknown;
	listDirs: (path: string) => string[];
}
