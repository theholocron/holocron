import { existsSync } from "node:fs";
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
 * Falls back to `startDir` unchanged when no `.git` is found walking all
 * the way to the filesystem root — soft-skip, not a hard failure; every
 * caller already treats `--cwd` itself as the root today, so an
 * unexpected non-git checkout just keeps today's behavior.
 */
export function findGitRoot(startDir: string): string {
	let dir = startDir;
	for (;;) {
		if (existsSync(`${dir}/.git`)) return dir;
		const parent = dirname(dir);
		// `dirname` of the filesystem root returns itself — the one
		// fixed point that means "nowhere left to climb."
		if (parent === dir) return startDir;
		dir = parent;
	}
}
