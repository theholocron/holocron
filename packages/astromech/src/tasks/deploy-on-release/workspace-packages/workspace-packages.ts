import { listWorkspacePackagesSync } from "@theholocron/pkg-utils";

import type { Tree, WorkspacePackage } from "./workspace-packages.type.js";

/**
 * Every package under `<repoRoot>/packages/*`, `<repoRoot>/apps/*` and
 * `<repoRoot>/plugins/*` with a readable, named `package.json` — `holocron`'s
 * own layout splits vendor plugin packages into `plugins/*` and deployable
 * apps into `apps/*`, siblings to `packages/*`.
 */
export function workspacePackages(repoRoot: string, { readJson, listDirs }: Tree): WorkspacePackage[] {
	return listWorkspacePackagesSync(repoRoot, {
		roots: ["packages", "apps", "plugins"],
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
