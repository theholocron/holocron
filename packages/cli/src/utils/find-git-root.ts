import { existsSync, realpathSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Walks up from `startDir` looking for a `.git` entry — a directory for a
 * normal checkout, a file for a worktree/submodule (contains a `gitdir:`
 * pointer, never followed here; its presence is enough to mark the root).
 *
 * `--cwd` picks which `holocron.config.ts` to load, which is NOT
 * necessarily the git repository root — a monorepo subpackage (e.g.
 * `packages/sentinel`) has its own config but no `.git` of its own.
 * Anything inherently repo-wide (`.github/workflows`, `.github/CODEOWNERS`,
 * `turbo.json`, "is this repo a monorepo") must resolve against the real
 * root, not `--cwd`, or it silently writes into a GitHub-invisible nested
 * `.github/` instead (holocron#1014).
 *
 * Falls back to the resolved start dir when no `.git` is found walking all
 * the way to the filesystem root — soft-skip, not a hard failure; every
 * caller already treats `--cwd` itself as the root today, so an
 * unexpected non-git checkout just keeps today's behavior.
 *
 * Resolves `startDir` to an absolute, symlink-free path before walking:
 * a relative `--cwd` (e.g. `"packages/sentinel"`) would otherwise hit
 * `dirname`'s fixed point at `"."` after only two steps, far short of the
 * real root, and a `--cwd` reached through a symlink would walk the
 * symlink's own lexical ancestors instead of the physical directory
 * tree its target actually lives in — in both cases landing on the
 * wrong directory, not genuinely "no `.git` found anywhere."
 *
 * `realpathSync` itself throws when `startDir` doesn't exist on disk at
 * all (a real possibility in tests, which often use a synthetic path
 * like `"/tmp/test"` that's never actually created) — caught and treated
 * the same as "no `.git` found," since this function's whole contract is
 * soft-skip, never a hard failure.
 */
export function findGitRoot(startDir: string): string {
	let resolvedStart: string;
	try {
		resolvedStart = realpathSync(startDir);
	} catch {
		return startDir;
	}
	let dir = resolvedStart;
	for (;;) {
		if (existsSync(`${dir}/.git`)) return dir;
		const parent = dirname(dir);
		// `dirname` of the filesystem root returns itself — the one
		// fixed point that means "nowhere left to climb." Falls back to
		// the resolved START dir, not wherever the climb ended up (the
		// filesystem root) — the soft-skip contract this function
		// documents above.
		if (parent === dir) return resolvedStart;
		dir = parent;
	}
}
