import { join } from "node:path";

/** The files a (possibly conditional) export points at, most useful first: its `import` build, then `default`, `types`, `require`. */
function targetsOf(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object") return [];
	return ["import", "default", "types", "require"].flatMap((c) => targetsOf((value as Record<string, unknown>)[c]));
}

/**
 * Where the source of a built file would be, most likely first: a build in `dist/` mirrors the package's `src/` (or its
 * root, for a package with no `src/`), as a file or as a folder's `index`. A declaration file, JSON and other
 * non-script targets have no source to measure.
 */
function sourcesFor(target: string): string[] {
	const file = target.replace(/^\.\//, "");
	if (/\.d\.[cm]?ts$/.test(file) || !/\.[cm]?[jt]s$/.test(file)) return [];
	if (/\.ts$/.test(file)) return [file];
	const built = file.replace(/^dist\//, "").replace(/\.[cm]?js$/, "");
	return [`src/${built}.ts`, `src/${built}/index.ts`, `${built}.ts`, `${built}/index.ts`];
}

/**
 * The source files behind a package's subpath exports (`./config`, `./testing`, …), as absolute paths: the entry points
 * the root entry does not cover. A subpath whose source cannot be found, whose target is not a script, or that is the
 * `package.json` export is left out, and so is a pattern export (`./*`), whose source cannot be named.
 */
export function subpathEntries(dir: string, exports: unknown, exists: (path: string) => boolean): string[] {
	if (!exports || typeof exports !== "object") return [];
	const found = new Set<string>();
	for (const [key, value] of Object.entries(exports)) {
		if (!key.startsWith("./") || key === "./package.json") continue;
		const source = targetsOf(value)
			.flatMap(sourcesFor)
			.find((c) => exists(join(dir, c)));
		if (source) found.add(join(dir, source));
	}
	return [...found];
}
