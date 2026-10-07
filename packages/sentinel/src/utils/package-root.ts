import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { findUpward } from "@theholocron/fs-utils";

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
 * depth. Built on `@theholocron/fs-utils`'s `findUpward` — the same
 * upward-walk shape `@theholocron/datapad`'s own config search needs,
 * only with a different predicate (and no `.git`-boundary stop here:
 * `node_modules` is expected to exist well before the filesystem root).
 */
export async function findPackageRoot(startDir: string): Promise<string> {
	const found = await findUpward(startDir, (dir) => (existsSync(join(dir, "node_modules")) ? dir : undefined));
	/* istanbul ignore next -- every real caller here sits under packages/sentinel, which always has node_modules before hitting the filesystem root */
	if (found === undefined) throw new Error(`findPackageRoot: no node_modules found above "${startDir}"`);
	return found;
}

// Lazy + memoized, not computed at import time: `findPackageRoot` does real
// filesystem work, which would mean *any* webhook delivery -- including
// event types that never touch a caller of `getPackageRoot()` at all, like
// `installation` or `ping` -- crashes the whole function if it fails. Found
// the hard way: a Vercel deploy where it couldn't resolve, taking down 100%
// of deliveries with `FUNCTION_INVOCATION_FAILED` before a single line of
// the actual caller's logic ever ran. Computing it lazily on first real use
// means a failure here only affects the path that actually needed it.
// Shared across every caller (`validate-config.ts`, `lint-commits.ts`, …) so
// the memoization -- and this same lesson -- isn't duplicated per file.
// Memoizes the in-flight promise, not only its resolved value, so
// concurrent first calls share one filesystem walk instead of racing.
let packageRootCache: Promise<string> | undefined;
export function getPackageRoot(): Promise<string> {
	// tsdown bundles the whole package into one flat `dist/index.mjs`, so
	// "this module's own location" sits one level under package root when
	// built, but deeper under it here in source (`src/utils/`,
	// `src/actions/`) -- walking up to the nearest `node_modules` resolves
	// every caller without hardcoding a depth only one of them would get
	// right.
	packageRootCache ??= findPackageRoot(dirname(fileURLToPath(import.meta.url)));
	return packageRootCache;
}
