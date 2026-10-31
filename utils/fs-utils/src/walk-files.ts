import { type Dirent, lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/** Options for {@link walkFilesSync}. */
export interface WalkFilesOptions {
	/** Directory names not descended into, at any depth (files with these names are still listed). Defaults to `.git` and `node_modules`. */
	skip?: Iterable<string>;
}

const DEFAULT_SKIP = [".git", "node_modules"];

/** The entry's type, asking the filesystem when the platform's directory listing couldn't say. */
function entryKind(entry: Dirent, full: string): "directory" | "file" | "other" {
	if (entry.isDirectory()) return "directory";
	if (entry.isFile()) return "file";
	if (entry.isSymbolicLink()) return "other";
	try {
		const stats = lstatSync(full);
		return stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
	} catch {
		return "other";
	}
}

/**
 * Every regular file under `dir`, as absolute paths in a stable (name-sorted,
 * depth-first) order. Directories named in `options.skip` are not entered.
 *
 * Symlinks found while walking are neither followed nor listed, so a link back
 * up the tree can't loop; `dir` itself is the caller's choice and is followed
 * if it is a symlink. A subdirectory that can't be read is skipped; `dir`
 * itself must be readable — its error propagates, since a typo'd root is a bug
 * to surface, not an empty result. The tree is assumed not to change while it
 * is walked: an entry swapped for a symlink mid-walk is not detected.
 */
export function walkFilesSync(dir: string, options: WalkFilesOptions = {}): string[] {
	const skip = new Set(options.skip ?? DEFAULT_SKIP);
	const files: string[] = [];

	function walk(current: string, isRoot: boolean): void {
		let entries: Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch (error) {
			if (isRoot) throw error;
			return;
		}
		entries.sort((a, b) => Number(a.name > b.name) - Number(a.name < b.name));
		for (const entry of entries) {
			const full = join(current, entry.name);
			const kind = entryKind(entry, full);
			if (kind === "directory") {
				if (!skip.has(entry.name)) walk(full, false);
			} else if (kind === "file") files.push(full);
		}
	}

	walk(resolve(dir), true);
	return files;
}
