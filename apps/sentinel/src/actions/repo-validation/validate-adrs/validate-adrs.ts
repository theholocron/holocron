import { decodeContents } from "../../../utils/index.js";
import type { AdrMessage, Field, ValidateAdrsInput, ValidateAdrsResult } from "./validate-adrs.type.js";

const ADR_PATH = /^docs\/wiki\/decisions\/[^/]+\.md$/;
const ADR_EXEMPT = new Set(["template.md", "README.md"]);
const SPEC_PATH = /^(?:\.notes|docs\/wiki\/specifications)\/[^/]+\.spec\.md$/;

const ADR_STATUSES = ["proposed", "accepted", "rejected", "deprecated", "superseded"];
const SPEC_STATUSES = ["draft", "proposed", "accepted", "archived", "superseded"];

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
