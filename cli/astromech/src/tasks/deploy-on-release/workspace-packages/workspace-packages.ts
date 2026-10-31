import { discoverWorkspacePackages } from "@theholocron/pkg-utils";

import type { Tree, WorkspacePackage } from "./workspace-packages.type.js";

/**
 * Every package the repo's `pnpm-workspace.yaml` declares (`packages/*`,
 * `apps/*` and `plugins/*` when it declares none) with a readable, named
 * `package.json`.
 */
export function workspacePackages(repoRoot: string, { readJson, listDirs }: Tree): WorkspacePackage[] {
	return discoverWorkspacePackages(repoRoot, {
		readFile: (path) => JSON.stringify(readJson(path)),
		// A directory that can't be listed is a directory that isn't there (e.g. no plugins/ or apps/).
		listDirs: (path) => {
			try {
				return listDirs(path);
			} catch {
				throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
			}
		},
	}).flatMap(({ name, dir, manifest }) =>
		name
			? [
					{
						name,
						dir,
						version: manifest.version,
						dependencies: manifest.dependencies ?? {},
						devDependencies: manifest.devDependencies ?? {},
					},
				]
			: []
	);
}
