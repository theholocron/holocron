/**
 * Validates the frontmatter of a PR's own changed ADRs and specs — the
 * Sentinel port of `platform.repoValidation`'s `Validate ADRs and specs` CI
 * job (`scripts/validate-adrs.mjs`, holocron#913). Same config-free,
 * no-checkout architecture as every other Bucket 1 check: the PR's changed
 * files come from `pulls.listFiles()`, each one's content from
 * `git.getContents()` at the PR's head ref.
 *
 * The rules are the script's own, unchanged:
 * - **ADRs** (`docs/wiki/decisions/*.md`, minus `template.md` / `README.md`):
 *   `id` present and matching the filename's sequence (`0001-x.md` →
 *   `ADR-0001`), non-empty `title`, a known `status`, an ISO `date`. An
 *   `accepted` ADR without a `discussion` link is a warning, not an error.
 * - **Specs** (`.notes/*.spec.md`, `docs/wiki/specifications/*.spec.md`):
 *   a known `status`. A missing `issue` is a warning, except for
 *   `archived` / `superseded` specs, which often predate the issue-first
 *   process.
 *
 * ADRs live in `docs/wiki/decisions/`. The script's own `ADR_DIR` points at
 * a `docs/decisions/` that doesn't exist, so the CI job has never actually
 * validated an ADR (holocron#914); this check uses the real path.
 *
 * Scoped to the files a PR touches rather than every file in the repo,
 * like the other Bucket 1 checks: a pre-existing problem in an untouched
 * file isn't this PR's to fix, and the CI job keeps validating the whole
 * tree until it's retired.
 */

import type { GitHubClient } from "@theholocron/github-client";

import { decodeContents } from "../../utils/decode-contents.js";

const ADR_PATH = /^docs\/wiki\/decisions\/[^/]+\.md$/;
const ADR_EXEMPT = new Set(["template.md", "README.md"]);
const SPEC_PATH = /^(?:\.notes|docs\/wiki\/specifications)\/[^/]+\.spec\.md$/;

const ADR_STATUSES = ["proposed", "accepted", "rejected", "deprecated", "superseded"];
const SPEC_STATUSES = ["draft", "proposed", "accepted", "archived", "superseded"];

export interface ValidateAdrsInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there. */
	ref: string;
}

export interface AdrMessage {
	file: string;
	/** 1-indexed — the offending frontmatter field's own line, or the file's first line when the field (or the whole frontmatter) is missing. */
	line: number;
	/** The frontmatter field at fault (`id`, `status`, …), or `frontmatter` when there's none at all. */
	rule: string;
	reason: string;
	severity: "error" | "warning";
}

export interface ValidateAdrsResult {
	valid: boolean;
	fileCount: number;
	messages: AdrMessage[];
}

interface Field {
	value: string;
	line: number;
}

/**
 * The script's own frontmatter parser, line-numbered: a leading `---` block
 * of `key: value` lines, plus one level of nesting keyed `parent.child`
 * (the template's `discussion:` / `  github:`). Returns `null` when the
 * file has none.
 */
export function parseFrontmatter(content: string): Map<string, Field> | null {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match) return null;
	const fields = new Map<string, Field>();
	let parent: string | undefined;
	match[1]!.split("\n").forEach((text, i) => {
		// +2: line 1 is the opening `---`.
		const line = i + 2;
		const kv = /^(\w[\w-]*):\s*(.*)/.exec(text);
		if (kv) {
			fields.set(kv[1]!, { value: kv[2]!.trim(), line });
			parent = kv[1];
			return;
		}
		// One level of nesting (`discussion:` / `  github: <url>`), keyed
		// `parent.child` so the template's nested fields are visible.
		const nested = /^\s+(\w[\w-]*):\s*(.*)/.exec(text);
		if (nested && parent) fields.set(`${parent}.${nested[1]!}`, { value: nested[2]!.trim(), line });
	});
	return fields;
}

function isValidIsoDate(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

export function validateAdr(file: string, content: string): AdrMessage[] {
	const messages: AdrMessage[] = [];
	const issue = (rule: string, reason: string, line = 1, severity: AdrMessage["severity"] = "error") =>
		messages.push({ file, line, rule, reason, severity });

	const fm = parseFrontmatter(content);
	if (!fm) {
		issue("frontmatter", "no frontmatter found");
		return messages;
	}

	const id = fm.get("id");
	const sequence = /^(\d{4})-/.exec(basename(file))?.[1];
	if (!id?.value) issue("id", "missing `id` field", id?.line);
	else if (sequence && id.value !== `ADR-${sequence}`) {
		issue("id", `id "${id.value}" does not match filename sequence (expected ADR-${sequence})`, id.line);
	}

	const title = fm.get("title");
	if (!title?.value || title.value === '""' || title.value === "''") {
		issue("title", "missing or empty `title` field", title?.line);
	}

	const status = fm.get("status");
	if (!status?.value) issue("status", "missing `status` field", status?.line);
	else if (!ADR_STATUSES.includes(status.value)) {
		issue("status", `invalid status "${status.value}" — must be one of: ${ADR_STATUSES.join(", ")}`, status.line);
	}

	const date = fm.get("date");
	if (!date?.value) issue("date", "missing `date` field", date?.line);
	else if (!isValidIsoDate(date.value)) {
		issue("date", `invalid date "${date.value}" — must be YYYY-MM-DD`, date.line);
	}

	if (status?.value === "accepted" && !fm.get("discussion.github")?.value && !fm.get("discussion")?.value) {
		issue("discussion", "status is accepted but `discussion.github` is not set", status.line, "warning");
	}

	return messages;
}

export function validateSpec(file: string, content: string): AdrMessage[] {
	const messages: AdrMessage[] = [];
	const fm = parseFrontmatter(content);
	if (!fm) return [{ file, line: 1, rule: "frontmatter", reason: "no frontmatter found", severity: "error" }];

	const status = fm.get("status");
	if (!status?.value) {
		messages.push({
			file,
			line: status?.line ?? 1,
			rule: "status",
			reason: "missing `status` field",
			severity: "error",
		});
	} else if (!SPEC_STATUSES.includes(status.value)) {
		messages.push({
			file,
			line: status.line,
			rule: "status",
			reason: `invalid status "${status.value}" — must be one of: ${SPEC_STATUSES.join(", ")}`,
			severity: "error",
		});
	}

	if (!fm.get("issue")?.value && status?.value !== "archived" && status?.value !== "superseded") {
		messages.push({
			file,
			line: 1,
			rule: "issue",
			reason: "missing `issue` field — every spec must have a companion GitHub issue",
			severity: "warning",
		});
	}

	return messages;
}

export async function validateAdrs(input: ValidateAdrsInput): Promise<ValidateAdrsResult> {
	const { client, repo, pullNumber, ref } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);

	const targets = changedFiles.filter(
		(f) =>
			f.status !== "removed" &&
			((ADR_PATH.test(f.filename) && !ADR_EXEMPT.has(basename(f.filename))) || SPEC_PATH.test(f.filename))
	);

	const messages: AdrMessage[] = [];
	for (const target of targets) {
		const contents = await client.git.getContents(repo, target.filename, ref);
		const text = decodeContents(contents.content);
		messages.push(
			...(ADR_PATH.test(target.filename)
				? validateAdr(target.filename, text)
				: validateSpec(target.filename, text))
		);
	}

	return { valid: messages.length === 0, fileCount: targets.length, messages };
}
