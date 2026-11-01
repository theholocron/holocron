import { isValidIsoDate } from "../is-valid-iso-date/index.js";
import { parseFrontmatter } from "../parse-frontmatter/index.js";
import { ADR_STATUSES } from "../spec-locations/index.js";
import type { SpecFinding } from "../specs.type.js";

/**
 * The findings for one ADR's text. Errors: no frontmatter; a missing `id`, or one that is not `ADR-<the filename's
 * four-digit prefix>`; a missing or empty `title`; a missing or unknown `status`; a missing or malformed `date`. A
 * warning: an `accepted` ADR with neither `discussion.url` (the address of its discussion post, written by `holocron specs sync`) nor the older `discussion.github` set.
 */
export function validateAdr(file: string, content: string): SpecFinding[] {
	const findings: SpecFinding[] = [];
	const add = (rule: string, reason: string, line = 1, severity: SpecFinding["severity"] = "error"): void => {
		findings.push({ file, line, rule, reason, severity });
	};

	const fm = parseFrontmatter(content);
	if (!fm) {
		add("frontmatter", "no frontmatter found");
		return findings;
	}

	const id = fm.get("id");
	const sequence = /^(\d{4})-/.exec(file.slice(file.lastIndexOf("/") + 1))?.[1];
	if (!id?.value) add("id", "missing `id` field", id?.line);
	else if (sequence && id.value !== `ADR-${sequence}`) {
		add("id", `id "${id.value}" does not match filename sequence (expected ADR-${sequence})`, id.line);
	}

	const title = fm.get("title");
	if (!title?.value || title.value === '""' || title.value === "''") {
		add("title", "missing or empty `title` field", title?.line);
	}

	const status = fm.get("status");
	if (!status?.value) add("status", "missing `status` field", status?.line);
	else if (!ADR_STATUSES.includes(status.value)) {
		add("status", `invalid status "${status.value}" — must be one of: ${ADR_STATUSES.join(", ")}`, status.line);
	}

	const date = fm.get("date");
	if (!date?.value) add("date", "missing `date` field", date?.line);
	else if (!isValidIsoDate(date.value)) {
		add("date", `invalid date "${date.value}" — must be YYYY-MM-DD`, date.line);
	}

	const linked = ["discussion.url", "discussion.github", "discussion"].some((key) => fm.get(key)?.value);
	if (status?.value === "accepted" && !linked) {
		add(
			"discussion",
			"status is accepted but neither `discussion.url` nor `discussion.github` is set",
			status.line,
			"warning"
		);
	}

	return findings;
}
