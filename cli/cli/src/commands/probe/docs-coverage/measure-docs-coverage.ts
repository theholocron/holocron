import { existsSync } from "node:fs";
import { join } from "node:path";

import { discoverWorkspacePackages } from "@theholocron/astromech";

import { countSymbols } from "./count-symbols.js";
import type { MeasureDocsCoverageInput, PackageDocs } from "./docs-coverage.type.js";

/** Where a package's public API starts: `src/index.ts`, or `index.ts` for a flat layout. */
const ENTRIES = ["src/index.ts", "index.ts"];

function workspaceEntries(repoRoot: string): NonNullable<MeasureDocsCoverageInput["packages"]> {
	return discoverWorkspacePackages(repoRoot).flatMap(({ name, dir, relativeDir, manifest }) => {
		const entry = ENTRIES.find((e) => existsSync(join(dir, e)));
		if (!name || manifest.private || !entry) return [];
		const tsconfig = join(dir, "tsconfig.json");
		return [{ name, dir: relativeDir, entry: join(dir, entry), ...(existsSync(tsconfig) ? { tsconfig } : {}) }];
	});
}

/** The doc-comment coverage of every public package: one TypeDoc pass per entry point, sorted by directory. */
export function measureDocsCoverage(input: MeasureDocsCoverageInput): PackageDocs[] {
	const packages = input.packages ?? workspaceEntries(input.repoRoot);
	return packages
		.filter(({ dir }) => input.only?.(dir) ?? true)
		.map(({ name, dir, entry, tsconfig }) => ({
			name,
			dir,
			symbols: countSymbols(input.typedoc(entry, tsconfig).children, `${dir}/src/index.ts`),
		}))
		.sort((a, b) => a.dir.localeCompare(b.dir));
}
