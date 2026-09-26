/**
 * Lints a PR's own changed markdown files for insensitive/inconsiderate
 * language via `alex` — the second Bucket 1 static-analysis check
 * (holocron#769/#793, `tech-sentinel-ci-runner.spec.md`), confirming the
 * "config-free, no checkout needed, centralize in Sentinel" pattern
 * commit-standards proved generalizes beyond commitlint specifically.
 *
 * D1-equivalent: real `alex` (`markdown()`/`mdx()`), the exact same
 * programmatic API a local `alex` CLI invocation would use internally —
 * never a reimplementation of its rules.
 *
 * Config: this org's canonical `.alexrc.json`/`.alexignore` — read directly
 * from `@theholocron/cli`'s `ALEX_CONFIG`/`ALEX_IGNORE_PATTERNS` (the same
 * "one config, not N copies" reasoning `@theholocron/commitlint-config`
 * already established), not fetched per-repo via the Contents API. A
 * repo's own generated `.alexrc.json` is a synced copy of this, never a
 * genuine per-repo override (this repo's own `AGENTS.md`: "do not edit
 * manually").
 *
 * Security boundary (D6-amended, `tech-sentinel-ci-runner.spec.md`):
 * reads each changed file's content on the PR's own head ref via
 * `GitHubClient.git.getContents(repo, path, ref)` — a same-repo PR branch,
 * not a fork's. No riskier than what GitHub Actions already does by
 * default for a non-fork PR in this org (internal-only, no fork
 * contributors).
 */

import { ALEX_CONFIG, ALEX_IGNORE_PATTERNS } from "@theholocron/cli";
import type { GitHubClient } from "@theholocron/github-client";
import { markdown, mdx } from "alex";

import { decodeContents } from "../../utils/decode-contents.js";
import { isIgnored } from "../../utils/is-ignored.js";

const MARKDOWN_EXTENSIONS = [".md", ".mdx"];

export interface LintInclusiveLanguageInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface InclusiveLanguageMessage {
	file: string;
	line: number;
	column: number;
	/** commitlint's own message for the failure, e.g. "`He` may be insensitive, use `They`, `It` instead". */
	reason: string;
	ruleId: string;
	/** Which underlying retext plugin raised this — `"retext-profanities"` (violent/vulgar wording) or `"retext-equality"` (gendered/insensitive phrasing), the two `alex` bundles. Drives `post-inclusive-language-check.ts`'s per-message annotation severity. */
	source?: string;
	/**
	 * `retext-profanities`-only: `cuss`'s 0-2 sureness rating for how likely
	 * `actual` is used as profanity rather than clean text (0 = "beaver",
	 * unlikely; 2 = "asshat", likely) — not how severe the word itself is.
	 * Not a field `vfile-message`'s own type declares (each retext plugin
	 * attaches its own extra data to the message object at runtime), hence
	 * the cast at the one call site that reads it.
	 */
	profanitySeverity?: number;
}

export interface LintInclusiveLanguageResult {
	valid: boolean;
	fileCount: number;
	messages: InclusiveLanguageMessage[];
}

export async function lintInclusiveLanguage(input: LintInclusiveLanguageInput): Promise<LintInclusiveLanguageResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const targets = changedFiles.filter(
		(f) =>
			f.status !== "removed" &&
			MARKDOWN_EXTENSIONS.some((ext) => f.filename.endsWith(ext)) &&
			!isIgnored(f.filename, ALEX_IGNORE_PATTERNS)
	);

	const messages: InclusiveLanguageMessage[] = [];
	for (const target of targets) {
		const contents = await client.git.getContents(repo, target.filename, ref);
		const text = decodeContents(contents.content);
		const file = target.filename.endsWith(".mdx") ? mdx(text, ALEX_CONFIG) : markdown(text, ALEX_CONFIG);
		for (const m of file.messages) {
			messages.push({
				file: target.filename,
				line: m.line ?? 0,
				column: m.column ?? 0,
				reason: m.reason,
				ruleId: m.ruleId ?? "unknown",
				// `m.source` is typed `string | null` by the vfile-message version
				// alex resolves to; every real retext plugin (profanities,
				// equality) always sets a real string, so the null branch is
				// defensive only, not reachable through real alex output.
				/* istanbul ignore next -- see comment above */
				source: m.source ?? undefined,
				profanitySeverity: (m as unknown as { profanitySeverity?: number }).profanitySeverity,
			});
		}
	}

	return { valid: messages.length === 0, fileCount: targets.length, messages };
}
