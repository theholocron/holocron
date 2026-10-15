import { join } from "node:path";

import type { Tree, WorkspacePackage } from "./deploy-on-release.type.js";

function scanWorkspaceDir(dirPath: string, { readJson, listDirs }: Tree): WorkspacePackage[] {
	let folders: string[];
	try {
		folders = listDirs(dirPath);
	} catch {
		return []; // directory doesn't exist — fine, it's optional (e.g. plugins/)
	}
	return folders.flatMap((folder) => {
		try {
			const manifest = readJson(join(dirPath, folder, "package.json")) as {
				name?: string;
				version?: string;
				dependencies?: Record<string, string>;
			};
			if (!manifest.name) return [];
			return [
				{
					name: manifest.name,
					dir: join(dirPath, folder),
					version: manifest.version,
					dependencies: manifest.dependencies ?? {},
				},
			];
		} catch {
			return [];
		}
	});
}

/**
 * Every package under `<repoRoot>/packages/*` and `<repoRoot>/plugins/*`
 * with a readable, named `package.json` — `holocron`'s own layout splits
 * vendor plugin packages into `plugins/*`, sibling to `packages/*`.
 */
export function workspacePackages(repoRoot: string, tree: Tree): WorkspacePackage[] {
	return [
		...scanWorkspaceDir(join(repoRoot, "packages"), tree),
		...scanWorkspaceDir(join(repoRoot, "plugins"), tree),
	];
}
