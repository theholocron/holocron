/**
 * Lints a PR's own changed files for prettier-compliant formatting — the
 * third Bucket 1 static-analysis check (holocron#769/#819), same
 * config-free, no-checkout architecture #793 (alex) and commit-standards
 * already proved out.
 *
 * D1-equivalent: real `prettier` (`check()`/`format()`/`getFileInfo()`),
 * the exact same programmatic API a local `prettier --check` invocation
 * uses internally — never a reimplementation of its formatting rules.
 *
 * Config: this org's canonical `@theholocron/prettier-config` default
 * export — already one canonical, importable config (same "one config,
 * not N copies" reasoning already established for `@theholocron/
 * commitlint-config` and `ALEX_CONFIG`), not fetched per-repo. Ignore
 * list: `PRETTIER_IGNORE_PATTERNS` (`@theholocron/cli`) — files confirmed
 * live to fail `prettier.check()` today for reasons unrelated to real
 * formatting (machine-generated content, or no parser at all).
 *
 * Security boundary (D6-amended, same as `lint-inclusive-language.ts`):
 * reads each changed file's content on the PR's own head ref via
 * `GitHubClient.git.getContents(repo, path, ref)` — a same-repo PR
 * branch, not a fork's.
 *
 * Scope: any file `getFileInfo()` reports a real `inferredParser` for —
 * not a hardcoded extension allowlist the way alex's markdown-only scope
 * is. Prettier supports many file types, and its own parser-inference is
 * the authoritative signal for "would this tool even touch this file"
 * (confirmed live: `LICENSE` — no extension, no parser — throws
 * `UndefinedParserError` from `check()`/`format()` directly; `getFileInfo()`
 * reports `inferredParser: null` for it instead, letting this skip
 * cleanly rather than catching an exception as control flow).
 */

import { PRETTIER_IGNORE_PATTERNS } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";
import PRETTIER_CONFIG from "@theholocron/prettier-config";
import { check, format, getFileInfo } from "prettier";

import { decodeContents } from "../../utils/decode-contents.js";
import { isIgnored } from "../../utils/is-ignored.js";

export interface LintFormattingInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface FormattingMessage {
	file: string;
	/** 1-indexed — the first line that would change if reformatted (prettier reports pass/fail per file, not per-line findings the way alex does; this is the closest real anchor point without a full diff). */
	line: number;
	reason: string;
}

export interface LintFormattingResult {
	valid: boolean;
	/** Files prettier actually checked — narrower than every changed file, since files with no `inferredParser` (or matching `PRETTIER_IGNORE_PATTERNS`) are skipped entirely. */
	fileCount: number;
	messages: FormattingMessage[];
}

/** The first 1-indexed line where `original` and `formatted` diverge. */
function firstDifferingLine(original: string, formatted: string): number {
	const originalLines = original.split("\n");
	const formattedLines = formatted.split("\n");
	const length = Math.max(originalLines.length, formattedLines.length);
	for (let i = 0; i < length; i++) {
		if (originalLines[i] !== formattedLines[i]) return i + 1;
	}
	/* istanbul ignore next -- only reached if formatted === original, which the caller never invokes this for */
	return 1;
}

export async function lintFormatting(input: LintFormattingInput): Promise<LintFormattingResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const candidates = changedFiles.filter(
		(f) => f.status !== "removed" && !isIgnored(f.filename, PRETTIER_IGNORE_PATTERNS)
	);

	const messages: FormattingMessage[] = [];
	let fileCount = 0;
	for (const target of candidates) {
		const { inferredParser } = await getFileInfo(target.filename);
		if (!inferredParser) continue;
		fileCount++;

		const contents = await client.git.getContents(repo, target.filename, ref);
		const text = decodeContents(contents.content);
		const options = { ...PRETTIER_CONFIG, filepath: target.filename };
		const isValid = await check(text, options);
		if (isValid) continue;

		const formatted = await format(text, options);
		messages.push({
			file: target.filename,
			line: firstDifferingLine(text, formatted),
			reason: "Not formatted according to this org's shared prettier config — run `prettier --write` to fix.",
		});
	}

	return { valid: messages.length === 0, fileCount, messages };
}
