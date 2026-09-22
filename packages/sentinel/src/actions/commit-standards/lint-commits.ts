/**
 * Lints a PR's own commits against the shared `@theholocron/commitlint-config`
 * rules, centrally — the org-wide replacement for every repo's own
 * `platform.commitStandards.yml` CI job + local `.husky/commit-msg` hook
 * enforcement, run once here instead of N times (holocron#769/#771,
 * `.notes/tech-sentinel-enforcement.spec.md`).
 *
 * D1: real `@commitlint/lint` + `@commitlint/load` — the exact
 * programmatic API `@commitlint/cli`'s own CLI wires together internally
 * (mirrored from its `cli.js`: `load()` resolves the config's `rules`
 * `ignores`/`plugins`/`parserOpts`, then `lint(message, rules, opts)` runs
 * per commit) — never a reimplementation of commitlint's rules. The CLI
 * mode itself isn't used (no `child_process`, no PATH-resolved binary) —
 * this is a Vercel Function, and the programmatic API is both simpler and
 * avoids spawning a subprocess in that runtime.
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
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import lint from "@commitlint/lint";
import load from "@commitlint/load";
import type { LintOptions, ParserPreset } from "@commitlint/types";
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

/** `parserPreset.parserOpts`, if the loaded config sets one — same lookup `@commitlint/cli`'s own `selectParserOpts()` does. */
function selectParserOpts(parserPreset: ParserPreset | undefined): ParserPreset["parserOpts"] {
	return parserPreset?.parserOpts;
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
	const opts: LintOptions = {
		// `@theholocron/commitlint-config` sets no parserPreset of its own
		// (relies on commitlint's built-in default parser) or a non-empty
		// `ignores` today beyond the one dependabot-bump matcher it does set —
		// both `?? {}`/`?? []` are real fallbacks for a config that could set
		// either, not dead code, even though this org's own shared config
		// never exercises the "unset" side for `ignores` and never exercises
		// the "set" side for `parserPreset`.
		/* istanbul ignore next -- see comment above */
		parserOpts: selectParserOpts(loaded.parserPreset) ?? {},
		plugins: loaded.plugins,
		/* istanbul ignore next -- see comment above */
		ignores: loaded.ignores ?? [],
		defaultIgnores: loaded.defaultIgnores !== false,
	};

	const violations: CommitViolation[] = [];
	for (const commit of commits) {
		const outcome = await lint(commit.commit.message, loaded.rules, opts);
		if (!outcome.valid) {
			for (const error of outcome.errors) {
				violations.push({ sha: commit.sha, rule: error.name, message: error.message });
			}
		}
	}

	return { valid: violations.length === 0, commitCount: commits.length, violations };
}
