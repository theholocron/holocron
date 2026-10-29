import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Walks upward from `startDir` — `startDir` itself first, then its parent,
 * then its parent's parent, and so on — calling `check` at each directory
 * and returning the first result it produces that isn't `undefined`.
 *
 * `stop`, when given, is checked at a directory only after `check` has
 * already come back empty there (so that directory is still fully
 * checked before stopping) — return `true` to end the walk there without
 * a result, instead of continuing to its parent. Common use: stop at a
 * repo root (see {@link hasGitEntry}) rather than wandering into an
 * unrelated enclosing directory tree.
 *
 * Always terminates: directory nesting is finite, and walking stops
 * unconditionally once the filesystem root is reached (its own parent).
 */
export async function findUpward<T>(
	startDir: string,
	check: (dir: string) => T | undefined | Promise<T | undefined>,
	stop?: (dir: string) => boolean | Promise<boolean>
): Promise<T | undefined> {
	let dir = startDir;
	for (;;) {
		const result = await check(dir);
		if (result !== undefined) return result;
		if (stop && (await stop(dir))) return undefined;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

/**
 * `true` when `dir` has a `.git` entry — a directory in a normal checkout,
 * a file in a worktree/submodule (existence is all that matters, not the
 * type). A common `stop` boundary for {@link findUpward}: treat the
 * nearest `.git` as the project root, searched but not walked past.
 */
export async function hasGitEntry(dir: string): Promise<boolean> {
	try {
		await stat(join(dir, ".git"));
		return true;
	} catch {
		return false;
	}
}
