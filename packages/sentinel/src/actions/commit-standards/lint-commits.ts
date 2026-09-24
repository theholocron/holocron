/**
 * Lints a PR's own commits against the shared `@theholocron/commitlint-config`
 * rules, centrally — the org-wide replacement for every repo's own
 * `platform.commitStandards.yml` CI job + local `.husky/commit-msg` hook
 * enforcement, run once here instead of N times (holocron#769/#771,
 * `.notes/tech-sentinel-enforcement.spec.md`).
 *
 * D1: real `@commitlint/lint` + `@commitlint/load` — the exact
 * programmatic API `@commitlint/cli`'s own CLI wires together internally.
 * The actual "lint one message against a loaded config" step is shared with
 * `@theholocron/cli`'s `holocron lint commit-msg` (`lintCommitMessage()`,
 * holocron#789) — genuinely identical logic either way. What stays
 * Sentinel-specific is *how the config gets loaded*: Sentinel runs
 * standalone, away from any real repo checkout, so it can't rely on
 * `@commitlint/load`'s normal ambient discovery the way a local CLI command
 * (running inside a real checkout) safely can.
 *
 * `@commitlint/load`'s ambient config discovery, deliberately defeated:
 * it uses `cosmiconfig` with a `"global"` search strategy that walks
 * *upward* from `cwd` looking for any `commitlint.config.*`/`.commitlintrc*`
 * file and merges whatever it finds in underneath the explicit seed —
 * found live running this package's own tests from inside the
 * `theholocron/holocron` monorepo, which has its own root
 * `commitlint.config.ts`: it silently got picked up and merged in,
 * masking a real bug and giving a false-positive test pass. Production
 * Sentinel doesn't run inside a repo checkout, so this specific ambient
 * file likely wouldn't exist there either — but "probably fine given
 * where it happens to run from" is exactly the kind of environment
 * dependency this needs to not have. Fixed the same way
 * `validateConfig()` already solved an unrelated instance of "needs a
 * real filesystem location, isolated from wherever Sentinel happens to
 * be invoked from": an empty seed file under `os.tmpdir()`, `--config`-style,
 * with `node_modules` symlinked in so `@theholocron/commitlint-config`
 * still resolves — `load()`'s explicit `file` option loads *exactly* that
 * file (`cosmiconfig`'s `.load()`), never searches upward for anything
 * else. The result is always and only `@theholocron/commitlint-config`'s
 * own rules, regardless of what's lying around on the filesystem.
 *
 * Security boundary (D4/D6): each commit's *message string* comes from
 * `GitHubClient.pulls.listCommits()` — plain API metadata, no file content
 * and no code from the PR branch or fork ever read, imported, or run. Safe
 * from a fork PR, not just a same-repo one; this action needs no `ref`
 * parameter anywhere, unlike `validateConfig()`'s default-branch-only reads.
 *
 * `@theholocron/commitlint-config` resolves `extends: [...]` chains by
 * *string name* at runtime (`@commitlint/resolve-extends`), several hops
 * deep (`@theholocron/commitlint-config` → `@commitlint/config-conventional`
 * → `conventional-changelog-conventionalcommits` → ...) — never through a
 * real `import`/`require` edge. Vercel's `@vercel/nft` build-time file
 * tracer only bundles files reachable through such an edge, so it silently
 * dropped each of these packages from the deployed Lambda one at a time as
 * they were found live (holocron#776-#778), even though every one of them
 * resolves fine locally against a real `node_modules` on disk. Chasing
 * individual `import "pkg"` workarounds down an open-ended, version-shifting
 * chain doesn't scale — fixed once, structurally, via `vercel.json`'s
 * `functions["api/webhook.mjs"].includeFiles: "node_modules/**"` (see
 * `scripts/stage-deploy.mjs`'s own docstring), which ships this function's
 * entire installed `node_modules` regardless of what nft can trace. `@commitlint/
 * config-conventional` still needs its own explicit `dependencies` entry in
 * this package's `package.json` even so — it's a `peerDependency` of
 * `@theholocron/commitlint-config`, not a transitive `dependency`, so it
 * still wouldn't get installed at all without one.
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import load from "@commitlint/load";
import { lintCommitMessage } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";

import { getPackageRoot } from "../../utils/package-root.js";

export interface LintCommitsInput {
	client: Pick<GitHubClient, "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
}

export interface CommitViolation {
	sha: string;
	/** Rule name, e.g. `"subject-empty"`. */
	rule: string;
	/** commitlint's own message for the failure, e.g. `"subject may not be empty"`. */
	message: string;
}

export interface LintCommitsResult {
	valid: boolean;
	commitCount: number;
	violations: CommitViolation[];
}

/**
 * Resolves `@theholocron/commitlint-config`'s fully-merged rules, isolated
 * from any ambient local config file — see the module docstring. Mirrors
 * `validateConfig()`'s own temp-dir + symlinked `node_modules` shape.
 */
async function loadIsolatedConfig() {
	const tmpRoot = tmpdir();
	await mkdir(tmpRoot, { recursive: true });
	const tmpDir = await mkdtemp(join(tmpRoot, "sentinel-commitlint-"));
	await symlink(join(getPackageRoot(), "node_modules"), join(tmpDir, "node_modules"), "dir");
	const seedFile = join(tmpDir, "seed.json");
	await writeFile(seedFile, "{}", "utf8");
	try {
		return await load({ extends: ["@theholocron/commitlint-config"] }, { file: seedFile });
	} finally {
		await rm(tmpDir, { recursive: true, force: true });
	}
}

export async function lintCommits(input: LintCommitsInput): Promise<LintCommitsResult> {
	const { client, repo, pullNumber } = input;
	const commits = await client.pulls.listCommits(repo, pullNumber);

	const loaded = await loadIsolatedConfig();

	const violations: CommitViolation[] = [];
	for (const commit of commits) {
		const messageViolations = await lintCommitMessage(commit.commit.message, loaded);
		for (const v of messageViolations) {
			violations.push({ sha: commit.sha, rule: v.rule, message: v.message });
		}
	}

	return { valid: violations.length === 0, commitCount: commits.length, violations };
}
