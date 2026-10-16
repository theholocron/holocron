import { listWorkspacePackagesSync, type PackageJson, readPackageJsonSync } from "@theholocron/pkg-utils";

import { hasPackagesDir } from "./has-packages-dir.js";
import { hasPluginsDir } from "./has-plugins-dir.js";

/**
 * Monorepo (`packages/` and/or `plugins/` present): every workspace under
 * either. Single package (neither dir present): the root `package.json`.
 * Callers keep the public ones.
 */
export function discoverManifests(cwd: string): { manifest: PackageJson; dir: string }[] {
	if (!hasPackagesDir(cwd) && !hasPluginsDir(cwd)) {
		const manifest = readPackageJsonSync(cwd);
		return manifest ? [{ manifest, dir: "." }] : [];
	}
	return listWorkspacePackagesSync(cwd).map(({ manifest, relativeDir }) => ({ manifest, dir: `./${relativeDir}` }));
}
