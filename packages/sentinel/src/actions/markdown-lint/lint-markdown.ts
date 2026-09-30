/**
 * Lints a PR's own changed markdown files against this org's canonical
 * markdownlint config — the fourth Bucket 1 static-analysis check
 * (holocron#769/#821), same config-free, no-checkout architecture alex
 * (#793) and prettier (#819) already proved out twice.
 *
 * D1-equivalent: real `markdownlint` (`lint()` from `markdownlint/promise`),
 * the exact same programmatic API a local `markdownlint-cli2` invocation
 * uses internally — never a reimplementation of its rules.
 *
 * Config: this org's canonical `@theholocron/markdownlint-config` default
 * export — already one canonical, importable config (same "one config, not
 * N copies" reasoning `@theholocron/prettier-config`/`ALEX_CONFIG`/
 * `@theholocron/commitlint-config` all established), not fetched per-repo.
 * Ignore list: reuses `ALEX_IGNORE_PATTERNS` (`@theholocron/cli`) — same
 * markdown-only scope and the same reasons those files aren't worth
 * linting (machine-generated `CHANGELOG.md`, no-prose `LICENSE`,
 * boilerplate `.github/*` templates) apply equally to markdownlint's
 * structural rules as they do to alex's prose rules.
 *
 * Security boundary (D6-amended, same as `lint-inclusive-language.ts`/
 * `lint-formatting.ts`): reads each changed file's content on the PR's own
 * head ref via `GitHubClient.git.getContents(repo, path, ref)` — a
 * same-repo PR branch, not a fork's.
 *
 * One `lint()` call for every candidate file's content, not a per-file
 * loop — `markdownlint`'s own `strings` option is designed to batch-lint
 * multiple named contents in a single call, returning results keyed by
 * the same names given (`LintResults`); every content fetch is still one
 * `getContents()` call per file (GitHub's Contents API has no batch-read),
 * but the actual lint pass itself doesn't need to run once per file the
 * way `prettier.check()`/`alex.markdown()` do.
 */

import { ALEX_IGNORE_PATTERNS } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";
import MARKDOWNLINT_CONFIG from "@theholocron/markdownlint-config";
import { lint } from "markdownlint/promise";

import { decodeContents } from "../../utils/decode-contents.js";
import { isIgnored } from "../../utils/is-ignored.js";

const MARKDOWN_EXTENSIONS = [".md", ".mdx"];

export interface LintMarkdownInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface MarkdownLintMessage {
	file: string;
	/** 1-indexed. */
	line: number;
	ruleNames: string[];
	/** markdownlint's own `ruleDescription`, e.g. "Heading levels should only increment by one level at a time". */
	reason: string;
	/** `[startColumn, length]`, 1-indexed — `null` when the rule can't localize the finding to a specific span on the line. */
	errorRange: number[] | null;
	/** markdownlint's own per-rule severity — defaults to `"error"` unless `@theholocron/markdownlint-config` configures a rule as `{ severity: "warning" }`. */
	severity: "error" | "warning";
}

export interface LintMarkdownResult {
	valid: boolean;
	fileCount: number;
	messages: MarkdownLintMessage[];
}

export async function lintMarkdown(input: LintMarkdownInput): Promise<LintMarkdownResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const targets = changedFiles.filter(
		(f) =>
			f.status !== "removed" &&
			MARKDOWN_EXTENSIONS.some((ext) => f.filename.endsWith(ext)) &&
			!isIgnored(f.filename, ALEX_IGNORE_PATTERNS)
	);

	const strings: Record<string, string> = {};
	for (const target of targets) {
		const contents = await client.git.getContents(repo, target.filename, ref);
		strings[target.filename] = decodeContents(contents.content);
	}

	const results = await lint({ config: MARKDOWNLINT_CONFIG, strings });

	const messages: MarkdownLintMessage[] = [];
	for (const [file, errors] of Object.entries(results)) {
		for (const e of errors) {
			messages.push({
				file,
				line: e.lineNumber,
				ruleNames: e.ruleNames,
				reason: e.ruleDescription,
				errorRange: e.errorRange,
				severity: e.severity,
			});
		}
	}

	return { valid: messages.length === 0, fileCount: targets.length, messages };
}
