import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walks upward from `startDir` to the nearest ancestor holding a
 * `node_modules` directory — this package's own root, regardless of how
 * deep `startDir` sits under it. Checks for `node_modules`, not
 * `package.json`: found the hard way (a `FUNCTION_INVOCATION_FAILED` on
 * every single webhook delivery, including ones that never even reach
 * `validateConfig()` — see `validate-config.ts`'s lazy-init comment for
 * that half of the fix). Vercel's Node.js Functions build ships this
 * package's deployed bundle through `@vercel/nft`, which traces actual
 * `import`/`require` edges from the entry point and only includes files
 * proven reachable that way — `package.json` is never `import`ed, only
 * read via `existsSync`, so it doesn't survive tracing and isn't
 * reliably present at runtime. `node_modules` is: the code's own real
 * imports (`@theholocron/cli` et al.) need it to resolve at all, so it's
 * guaranteed present in every runtime this package ships to (local dev,
 * vitest, Vercel).
 *
 * Depth differs by how the caller is running: tsdown bundles the whole
 * package into one flat `dist/index.mjs` (one level under root), while
 * vitest runs directly against nested source files (`src/utils/…`, two
 * levels under root) — a walk-up resolves both without hardcoding either
 * depth.
 */
export function findPackageRoot(startDir: string): string {
	let dir = startDir;
	while (!existsSync(join(dir, "node_modules"))) {
		const parent = dirname(dir);
		/* istanbul ignore next -- every real caller here sits under packages/sentinel, which always has node_modules before hitting the filesystem root */
		if (parent === dir) throw new Error(`findPackageRoot: no node_modules found above "${startDir}"`);
		dir = parent;
	}
	return dir;
}
