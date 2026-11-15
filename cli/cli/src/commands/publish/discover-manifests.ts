import { discoverWorkspacePackages, type PackageJson, readPackageJsonSync } from "@theholocron/pkg-utils";

import type { WorkspaceScope } from "./workspace-scope.type.js";

/** `./plugins/x/`, `plugins/x` and `plugins/x/` are the same folder. */
const normalizeDir = (dir: string): string => dir.replace(/^\.\//, "").replace(/\/+$/, "");

/**
 * Monorepo (the workspace declares public packages): every workspace
 * package. Single package (it declares none -- no `pnpm-workspace.yaml`, or one
 * listing only private members like a docs site): the root `package.json`.
 * Callers keep the public ones.
 *
 * With a `group` (a folder of the repo, `clients`), only that group's packages,
 * and never the root `package.json`: a group that has no packages has nothing to
 * publish, not a single-package repo.
 *
 * With `onlyPackages` (package names or their folders), only those packages: what is left after the group and
 * the exclusions is narrowed to them, and one that matches nothing is simply not there.
 */
export function discoverManifests(cwd: string, scope: WorkspaceScope = {}): { manifest: PackageJson; dir: string }[] {
	const found = discoverAll(cwd, scope);
	const only = scope.onlyPackages;
	if (only === undefined || only.length === 0) return found;
	const wanted = new Set(only.map(normalizeDir));
	return found.filter(({ manifest, dir }) => wanted.has(manifest.name ?? "") || wanted.has(normalizeDir(dir)));
}

function discoverAll(cwd: string, scope: WorkspaceScope): { manifest: PackageJson; dir: string }[] {
	const workspace = discoverWorkspacePackages(cwd, scope);
	if (scope.group !== undefined)
		return workspace.map(({ manifest, relativeDir }) => ({ manifest, dir: `./${relativeDir}` }));
	if (!workspace.some(({ manifest }) => !manifest.private)) {
		const manifest = readPackageJsonSync(cwd);
		return manifest ? [{ manifest, dir: "." }] : [];
	}
	return workspace.map(({ manifest, relativeDir }) => ({ manifest, dir: `./${relativeDir}` }));
}
