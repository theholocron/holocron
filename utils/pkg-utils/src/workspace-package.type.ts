import type { PackageJson } from "./package-json.type.ts";

/** One workspace package found by {@link listWorkspacePackagesSync}. */
export interface WorkspacePackageEntry {
	/** The manifest's `name`, when it has one. */
	name: string | undefined;
	/** Absolute path to the package directory. */
	dir: string;
	/** The directory relative to the repo root, `/`-separated (`packages/cli`). */
	relativeDir: string;
	manifest: PackageJson;
}
