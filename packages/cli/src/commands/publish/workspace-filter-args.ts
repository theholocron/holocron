import { hasPackagesDir } from "./has-packages-dir.js";
import { hasPluginsDir } from "./has-plugins-dir.js";

/**
 * `-r --filter=./packages/* --filter=./plugins/*` — whichever workspace
 * roots exist. Empty (single-package repo, no `-r`) when neither does.
 * Shared by every `pnpm publish` invocation below so a repo with only
 * `plugins/*` (or both) is covered the same as `packages/*`-only.
 */
export function workspaceFilterArgs(cwd: string): string[] {
	const filters: string[] = [];
	if (hasPackagesDir(cwd)) filters.push("--filter=./packages/*");
	if (hasPluginsDir(cwd)) filters.push("--filter=./plugins/*");
	return filters.length > 0 ? ["-r", ...filters] : [];
}
