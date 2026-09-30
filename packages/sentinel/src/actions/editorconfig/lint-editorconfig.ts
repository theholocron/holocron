/**
 * Lints a PR's own changed files for `.editorconfig` compliance — same
 * config-free, no-checkout architecture every other Bucket 1 check proves
 * out, and the same advisory/auto-fixable treatment as prettier (holocron#864)
 * rather than eslint/markdownlint/alex's severity-based merge-blocking:
 * an `.editorconfig` violation has no natural error/warning split (every
 * property is the same kind of formatting nitpick), and it's 100%
 * mechanically fixable — there's no human judgment call either surface
 * exists to help with, the exact reasoning that kept prettier out of the
 * severity-conclusion treatment too.
 *
 * D1-equivalent, partial: `editorconfig`'s own `matcher()` (the same core
 * resolution library `editorconfig-checker` and every real editor
 * integration build on) resolves each file's properties purely from the
 * repo's own `.editorconfig` content passed as a `Buffer` — no filesystem
 * walking, confirmed directly against this org's real `.editorconfig`
 * (cascading `[*.{json,yml,yaml}]`/`[*.{md,mdx}]`/named-file overrides all
 * resolve correctly from buffer content alone).
 *
 * The actual value-checking below — does this file's content satisfy the
 * resolved properties — has no real, importable library to call into.
 * `editorconfig-checker` (the real CLI tool built on this same resolution
 * library) is published CLI-only: no `main`/`exports` field, just a `bin`
 * pointing at an `ncc`-bundled entrypoint. This is a deliberate, narrow
 * exception to "never reimplement a tool's rules": unlike eslint's
 * constantly-evolving rule ecosystem, `.editorconfig`'s spec is six
 * properties that haven't meaningfully changed in years.
 *
 * Deliberately scoped to the properties checkable from raw text without
 * language-aware parsing, with no real ambiguity: `trim_trailing_whitespace`,
 * `insert_final_newline`, `end_of_line`, and `indent_style` (tab vs space,
 * per line's own leading whitespace). Explicitly NOT checked:
 * `indent_size` (verifying a specific indent *depth* from raw text alone is
 * unreliable — continuation lines, multi-line strings, and nested-block
 * depth all produce false positives without real language parsing) and
 * `charset` (this org's own `.editorconfig` only ever declares `utf-8`,
 * and reliably detecting `utf-8` vs `utf-8-bom` vs the other declarable
 * charsets from already-decoded string content, past `decodeContents()`'s
 * own base64→utf8 conversion, isn't worth the complexity for a property
 * this org has never once varied).
 *
 * Security boundary (D6-amended, same as every other Bucket 1 check):
 * reads each changed file's content, and the repo's own `.editorconfig`,
 * on the PR's own head ref via `GitHubClient.git.getContents(repo, path,
 * ref)` — a same-repo PR branch, not a fork's.
 */

import type { GitHubClient } from "@theholocron/github-client";
import { matcher, type Props } from "editorconfig";

import { decodeContents } from "../../utils/decode-contents.js";

export interface LintEditorConfigInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface EditorConfigMessage {
	file: string;
	/** 1-indexed — the first line with a violation. */
	line: number;
	reason: string;
}

export interface LintEditorConfigResult {
	valid: boolean;
	/** Files actually checked — 0 whenever the repo has no root `.editorconfig` at all, not an error, just nothing to check against. */
	fileCount: number;
	messages: EditorConfigMessage[];
}

/** Every violation on one file's content, against its own resolved properties — at most one message per property, first offending line only. */
function checkContent(text: string, props: Props): Array<{ line: number; reason: string }> {
	const messages: Array<{ line: number; reason: string }> = [];
	if (text.length === 0) return messages;

	const lines = text.split("\n");
	// A trailing "" from the final split is the file's own closing newline,
	// not a real line to check trailing-whitespace/indent-style on.
	const hasFinalNewline = lines[lines.length - 1] === "";
	const contentLines = hasFinalNewline ? lines.slice(0, -1) : lines;

	if (props.end_of_line === "lf" && text.includes("\r\n")) {
		messages.push({
			line: text.split("\r\n")[0]!.split("\n").length,
			reason: "Expected LF line endings, found CRLF.",
		});
	} else if (props.end_of_line === "crlf") {
		const bareLfIndex = text.replace(/\r\n/g, "").indexOf("\n");
		if (bareLfIndex !== -1) {
			messages.push({
				line: text.slice(0, bareLfIndex).split("\n").length,
				reason: "Expected CRLF line endings, found a bare LF.",
			});
		}
	}

	if (props.trim_trailing_whitespace === true) {
		const i = contentLines.findIndex((l) => /[ \t]$/.test(l));
		if (i !== -1) messages.push({ line: i + 1, reason: "Trailing whitespace." });
	}

	if (props.indent_style === "tab" || props.indent_style === "space") {
		const wrongChar = props.indent_style === "tab" ? " " : "\t";
		const i = contentLines.findIndex((l) => {
			const leading = /^[ \t]*/.exec(l)?.[0] ?? "";
			return leading.includes(wrongChar);
		});
		if (i !== -1) {
			messages.push({ line: i + 1, reason: `Expected ${props.indent_style} indentation.` });
		}
	}

	if (props.insert_final_newline === true && !hasFinalNewline) {
		messages.push({ line: contentLines.length, reason: "Missing final newline." });
	} else if (props.insert_final_newline === false && hasFinalNewline) {
		messages.push({ line: contentLines.length + 1, reason: "File should not end with a newline." });
	}

	return messages;
}

export async function lintEditorConfig(input: LintEditorConfigInput): Promise<LintEditorConfigResult> {
	const { client, repo, pullNumber, ref } = input;

	let editorConfigBuffer: Buffer;
	try {
		const contents = await client.git.getContents(repo, ".editorconfig", ref);
		editorConfigBuffer = Buffer.from(contents.content, "base64");
	} catch {
		return { valid: true, fileCount: 0, messages: [] };
	}

	const resolve = matcher({}, editorConfigBuffer);
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);
	const candidates = changedFiles.filter((f) => f.status !== "removed" && f.filename !== ".editorconfig");

	const messages: EditorConfigMessage[] = [];
	for (const target of candidates) {
		const props = resolve(target.filename);
		const contents = await client.git.getContents(repo, target.filename, ref);
		const text = decodeContents(contents.content);
		for (const { line, reason } of checkContent(text, props)) {
			messages.push({ file: target.filename, line, reason });
		}
	}

	return { valid: messages.length === 0, fileCount: candidates.length, messages };
}
