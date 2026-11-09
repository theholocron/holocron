import { join } from "node:path";

import type { IdeasDirEntry, IdeasIo } from "./ideas-io.type.js";

/**
 * Every Markdown note under `dir`, as paths relative to it with `/` separators, sorted. A folder whose name starts
 * with `_` or `.` (`.obsidian`, `.trash`, `_archive`) is not entered. `undefined` when `dir` itself cannot be read.
 */
export function listNotes(io: IdeasIo, dir: string): string[] | undefined {
	const top = io.readDir(dir);
	if (!top) return undefined;
	const found: string[] = [];
	const walk = (relative: string, entries: IdeasDirEntry[] | undefined): void => {
		for (const entry of entries ?? []) {
			const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
			if (entry.directory) {
				if (!/^[_.]/.test(entry.name)) walk(path, io.readDir(join(dir, path)));
			} else if (entry.name.toLowerCase().endsWith(".md") && !entry.name.startsWith(".")) {
				found.push(path);
			}
		}
	};
	walk("", top);
	return found.sort();
}
