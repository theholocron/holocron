import { join, resolve, sep } from "node:path";

import { packageLocation, readWorkspacePackages } from "@theholocron/astromech";
import { findRootSync } from "@theholocron/fs-utils";

import { readWorkspaceConfigs } from "../workspace-configs/index.js";
import type { AppLookup, WorkspaceApp } from "./resolve-app.type.js";

/** The workspace group an app lives in. */
const APPS_DIR = "apps";

/**
 * Finds an app under the workspace: by `name` (the app folder's name), or, with no name, the app whose folder holds
 * `cwd`. It works from the repository root or from inside an app, because the workspace is found by walking up from
 * `cwd`. Nothing is written and no provider is loaded; an app with a `holocron.config` carries it, one that has none
 * (Council) carries none, and one whose config cannot be read carries the reason.
 *
 * @param name - The app's name, or `undefined` to use the app `cwd` is inside.
 * @param cwd - The folder the command runs in.
 */
export async function resolveApp(name: string | undefined, cwd: string): Promise<AppLookup> {
	const repoRoot = findRootSync(cwd, "pnpm-workspace.yaml", { fallback: "start" }) as string;
	let packages: ReturnType<typeof readWorkspacePackages>;
	try {
		packages = readWorkspacePackages(repoRoot);
	} catch {
		packages = [];
	}
	const configs = new Map((await readWorkspaceConfigs(repoRoot)).map((c) => [c.path, c]));
	const apps: WorkspaceApp[] = [];
	for (const pkg of packages) {
		const path = packageLocation(pkg);
		const [group, folder, ...deeper] = path.split("/");
		if (group !== APPS_DIR || !folder || deeper.length > 0) continue;
		const found = configs.get(path);
		apps.push({
			name: folder,
			path,
			dir: join(repoRoot, path),
			...(found && "resolved" in found ? { config: found.resolved } : {}),
			...(found && "error" in found ? { configError: found.error } : {}),
		});
	}
	const here = resolve(cwd);
	const app =
		name === undefined
			? apps.find((a) => here === a.dir || here.startsWith(a.dir + sep))
			: apps.find((a) => a.name === name);
	return { repoRoot, ...(app ? { app } : {}), names: apps.map((a) => a.name) };
}
