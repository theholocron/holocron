import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walks upward from `startDir` to the nearest ancestor holding a
 * `package.json` — this package's own root, regardless of how deep
 * `startDir` sits under it. Depth differs by how the caller is running:
 * tsdown bundles the whole package into one flat `dist/index.mjs` (one
 * level under root), while vitest runs directly against nested source
 * files (`src/utils/…`, two levels under root) — a walk-up resolves both
 * without hardcoding either depth.
 */
export function findPackageRoot(startDir: string): string {
	let dir = startDir;
	while (!existsSync(join(dir, "package.json"))) {
		const parent = dirname(dir);
		/* istanbul ignore next -- every real caller here sits under packages/sentinel, which always has a package.json before hitting the filesystem root */
		if (parent === dir) throw new Error(`findPackageRoot: no package.json found above "${startDir}"`);
		dir = parent;
	}
	return dir;
}
