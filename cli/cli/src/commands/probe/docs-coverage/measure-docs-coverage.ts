import { existsSync } from "node:fs";
import { join } from "node:path";

import { discoverWorkspacePackages } from "@theholocron/pkg-utils";

import { countSymbols } from "./count-symbols.js";
import type { DocSymbol, MeasureDocsCoverageInput, PackageDocs } from "./docs-coverage.type.js";
import { subpathEntries } from "./subpath-entries.js";

/** Where a package's public API starts: `src/index.ts`, or `index.ts` for a flat layout. */
const ENTRIES = ["src/index.ts", "index.ts"];

function workspaceEntries(repoRoot: string): NonNullable<MeasureDocsCoverageInput["packages"]> {
	return discoverWorkspacePackages(repoRoot).flatMap(({ name, dir, relativeDir, manifest }) => {
		const entry = ENTRIES.find((e) => existsSync(join(dir, e)));
		if (!name || manifest.private || !entry) return [];
		const tsconfig = join(dir, "tsconfig.json");
		const root = join(dir, entry);
		// The subpath exports (`./config`, `./testing`, …) are public API too: the root entry does not reach them.
		const also = subpathEntries(dir, (manifest as { exports?: unknown }).exports, existsSync).filter(
			(e) => e !== root
		);
		return [
			{
				name,
				dir: relativeDir,
				entry: root,
				...(also.length > 0 ? { also } : {}),
				...(existsSync(tsconfig) ? { tsconfig } : {}),
			},
		];
	});
}

/**
 * A symbol once, however many entry points reach it: a subpath that re-exports from the root, or two subpaths that
 * share a module, would count it twice.
 */
function distinct(symbols: DocSymbol[]): DocSymbol[] {
	const seen = new Set<string>();
	return symbols.filter((s) => {
		const key = `${s.file}:${s.line}:${s.kind}:${s.name}`;
		return seen.has(key) ? false : (seen.add(key), true);
	});
}

/**
 * The doc-comment coverage of every public package: one TypeDoc pass per entry point (the root and each subpath
 * export), sorted by directory.
 */
export function measureDocsCoverage(input: MeasureDocsCoverageInput): PackageDocs[] {
	const packages = input.packages ?? workspaceEntries(input.repoRoot);
	return packages
		.filter(({ dir }) => input.only?.(dir) ?? true)
		.map(({ name, dir, entry, also, tsconfig }) => ({
			name,
			dir,
			symbols: distinct(
				[entry, ...(also ?? [])].flatMap((e) =>
					countSymbols(input.typedoc(e, tsconfig).children, `${dir}/src/index.ts`)
				)
			),
		}))
		.sort((a, b) => a.dir.localeCompare(b.dir));
}
