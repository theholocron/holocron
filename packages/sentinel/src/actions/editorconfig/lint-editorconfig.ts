/**
 * Lints a PR's own changed files for `.editorconfig` compliance — same
 * config-free, no-checkout architecture every other Bucket 1 check proves
 * out. Unlike prettier (`lint-formatting.ts`), this check's own conclusion
 * DOES fail on a violation (`post-editorconfig-check.ts`) — but every
 * property it checks is also 100% mechanically fixable, so a failure here
 * is meant to be transient: `commit-editorconfig-fix.ts` applies the fix
 * and commits it to the PR branch in the same handler invocation, which
 * fires a fresh webhook on the new commit that supersedes this one for
 * merge-blocking purposes. A failing check only survives when the fix
 * couldn't be applied automatically (see `indent_style` below) — that's
 * the intended fallback, not a bug: a human sees the same annotations
 * either way and fixes by hand what the bot couldn't.
 *
 * D1-equivalent, partial: `editorconfig`'s own `matcher()` (the same core
 * resolution library `editorconfig-checker` and every real editor
 * integration build on) resolves each file's properties purely from the
 * repo's own `.editorconfig` content passed as a `Buffer` — no filesystem
 * walking, confirmed directly against this org's real `.editorconfig`
 * (cascading `[*.{json,yml,yaml}]`/`[*.{md,mdx}]`/named-file overrides all
 * resolve correctly from buffer content alone).
 *
 * The actual value-checking/fixing below — does this file's content
 * satisfy the resolved properties, and if not, what should it look like —
 * has no real, importable library to call into. `editorconfig-checker`
 * (the real CLI tool built on this same resolution library) is published
 * CLI-only: no `main`/`exports` field, just a `bin` pointing at an
 * `ncc`-bundled entrypoint, and has no fix mode of its own regardless.
 * This is a deliberate, narrow exception to "never reimplement a tool's
 * rules": unlike eslint's constantly-evolving rule ecosystem,
 * `.editorconfig`'s spec is six properties that haven't meaningfully
 * changed in years.
 *
 * Checked (and fixed) properties — deliberately scoped to what's
 * checkable from raw text without language-aware parsing, with no real
 * ambiguity: `trim_trailing_whitespace`, `insert_final_newline`,
 * `end_of_line`, and `indent_style` (tab vs space, per line's own leading
 * whitespace). Three of the four are unconditionally safe string
 * transforms (strip trailing whitespace, add/remove one trailing
 * newline, normalize `\r\n`/`\n`). `indent_style` is best-effort: fixing
 * it correctly requires knowing `indent_size` (how many spaces equal one
 * tab) to convert leading whitespace without changing a line's effective
 * indent depth — this org's own `.editorconfig` always sets `indent_size`
 * alongside `indent_style` wherever the latter is overridden, so the
 * common case resolves cleanly, but `fixContent()` below walks each
 * line's leading whitespace and leaves it untouched (not guessed at) the
 * moment the conversion stops being an exact multiple of `indent_size` —
 * that line stays flagged, and the check keeps failing on it, rather than
 * risk corrupting a whitespace-sensitive file (YAML chief among them).
 *
 * Explicitly NOT checked (or fixed) at all: `indent_size` itself
 * (verifying a specific indent *depth* from raw text alone is unreliable
 * — continuation lines, multi-line strings, and nested-block depth all
 * produce false positives without real language parsing) and `charset`
 * (this org's own `.editorconfig` only ever declares `utf-8`, and
 * reliably detecting `utf-8` vs `utf-8-bom` vs the other declarable
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

export interface EditorConfigFix {
	file: string;
	/** The full corrected file content — `commit-editorconfig-fix.ts`'s own input, same shape as `FormattingMessage.formatted`. */
	fixed: string;
}

export interface LintEditorConfigResult {
	valid: boolean;
	/** Files actually checked — 0 whenever the repo has no root `.editorconfig` at all, not an error, just nothing to check against. */
	fileCount: number;
	messages: EditorConfigMessage[];
	/** One entry per file whose content changed under `fixContent()` — a strict subset of `messages`' files, since `indent_style` can leave a flagged line unfixed (see this module's own docstring). Empty whenever nothing was auto-fixable. */
	fixes: EditorConfigFix[];
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

/**
 * Produces `text` corrected against `props` — a strict superset of what
 * `checkContent()` flags, applied in dependency order: line endings first
 * (whole-text, before anything splits on a line boundary), then per-line
 * trailing whitespace and indent style, then the trailing newline last
 * (since adding/removing it depends on the now-final line endings).
 * Returns `text` unchanged when there's nothing to fix.
 */
function fixContent(text: string, props: Props): string {
	let normalized = text;
	if (props.end_of_line === "lf") {
		normalized = normalized.replace(/\r\n/g, "\n");
	} else if (props.end_of_line === "crlf") {
		normalized = normalized.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
	}

	const eol = props.end_of_line === "crlf" ? "\r\n" : normalized.includes("\r\n") ? "\r\n" : "\n";
	const lines = normalized.split(eol);
	const hasFinalNewline = lines[lines.length - 1] === "";
	let contentLines = hasFinalNewline ? lines.slice(0, -1) : lines;

	if (props.trim_trailing_whitespace === true) {
		contentLines = contentLines.map((l) => l.replace(/[ \t]+$/, ""));
	}

	if ((props.indent_style === "tab" || props.indent_style === "space") && typeof props.indent_size === "number") {
		const size = props.indent_size;
		contentLines = contentLines.map((l) => fixIndent(l, props.indent_style as "tab" | "space", size));
	}

	let fixed = contentLines.join(eol);
	if (props.insert_final_newline === true) {
		fixed += eol;
	} else if (props.insert_final_newline === undefined && hasFinalNewline) {
		fixed += eol;
	}

	return fixed;
}

/**
 * Converts one line's leading whitespace to `style`, `size` spaces per
 * tab stop — greedily, left to right, bailing out (returning `line`
 * untouched) the moment the remaining leading whitespace stops being an
 * exact multiple of `size`. That line stays flagged by `checkContent()`
 * on the next pass rather than risk guessing wrong on a whitespace-
 * sensitive file.
 */
function fixIndent(line: string, style: "tab" | "space", size: number): string {
	const leading = /^[ \t]*/.exec(line)![0];
	if (leading.length === 0) return line;
	const rest = line.slice(leading.length);

	if (style === "space") {
		if (!leading.includes("\t")) return line;
		return leading.replace(/\t/g, " ".repeat(size)) + rest;
	}

	if (!leading.includes(" ")) return line;
	let tabs = "";
	let i = 0;
	while (i < leading.length) {
		if (leading[i] === "\t") {
			tabs += "\t";
			i += 1;
		} else if (size > 0 && leading.slice(i, i + size) === " ".repeat(size)) {
			tabs += "\t";
			i += size;
		} else {
			return line;
		}
	}
	return tabs + rest;
}

export async function lintEditorConfig(input: LintEditorConfigInput): Promise<LintEditorConfigResult> {
	const { client, repo, pullNumber, ref } = input;

	let editorConfigBuffer: Buffer;
	try {
		const contents = await client.git.getContents(repo, ".editorconfig", ref);
		editorConfigBuffer = Buffer.from(contents.content, "base64");
	} catch {
		return { valid: true, fileCount: 0, messages: [], fixes: [] };
	}

	const resolve = matcher({}, editorConfigBuffer);
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);
	const candidates = changedFiles.filter((f) => f.status !== "removed" && f.filename !== ".editorconfig");

	const messages: EditorConfigMessage[] = [];
	const fixes: EditorConfigFix[] = [];
	for (const target of candidates) {
		const props = resolve(target.filename);
		const contents = await client.git.getContents(repo, target.filename, ref);
		const text = decodeContents(contents.content);
		const violations = checkContent(text, props);
		if (violations.length === 0) continue;

		for (const { line, reason } of violations) {
			messages.push({ file: target.filename, line, reason });
		}

		const fixed = fixContent(text, props);
		if (fixed !== text) fixes.push({ file: target.filename, fixed });
	}

	return { valid: messages.length === 0, fileCount: candidates.length, messages, fixes };
}
