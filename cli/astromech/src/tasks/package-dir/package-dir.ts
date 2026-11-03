import { dirname, join } from "node:path";

/**
 * `true` when `cwd` is a package inside a turbo workspace rather than its root: it has a `package.json` and no
 * `turbo.json` of its own, and a directory above it has one. `holocron run <suite>` from there runs only the
 * package-scoped leaves, scoped to that package.
 */
export function insidePackage(cwd: string, fileExists: (path: string) => boolean): boolean {
	if (!fileExists(join(cwd, "package.json")) || fileExists(join(cwd, "turbo.json"))) return false;
	for (let dir = dirname(cwd); dir !== dirname(dir); dir = dirname(dir)) {
		if (fileExists(join(dir, "turbo.json"))) return true;
	}
	return false;
}
