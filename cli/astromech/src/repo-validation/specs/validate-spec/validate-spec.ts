import { parseFrontmatter } from "../parse-frontmatter/index.js";
import { SPEC_STATUSES } from "../spec-locations/index.js";
import type { SpecFinding } from "../specs.type.js";

/**
 * The findings for one spec's text. Errors: no frontmatter; a missing or unknown `status`; an `id` that is not
 * `SPEC-` and four digits. Warnings: a missing `id` (`holocron specs sync` numbers it, so a new spec needs none); a missing
 * `issue` (every spec has a companion GitHub issue), except on an `archived` or `superseded` spec, many of which
 * predate the issue-first process.
 */
export function validateSpec(file: string, content: string): SpecFinding[] {
	const fm = parseFrontmatter(content);
	if (!fm) return [{ file, line: 1, rule: "frontmatter", reason: "no frontmatter found", severity: "error" }];

	const findings: SpecFinding[] = [];
	const status = fm.get("status");
	if (!status?.value) {
		findings.push({
			file,
			line: status?.line ?? 1,
			rule: "status",
			reason: "missing `status` field",
			severity: "error",
		});
	} else if (!SPEC_STATUSES.includes(status.value)) {
		findings.push({
			file,
			line: status.line,
			rule: "status",
			reason: `invalid status "${status.value}" — must be one of: ${SPEC_STATUSES.join(", ")}`,
			severity: "error",
		});
	}

	const id = fm.get("id");
	if (!id?.value) {
		findings.push({
			file,
			line: 1,
			rule: "id",
			reason: "missing `id` — `holocron specs sync` numbers a spec once it is on the default branch",
			severity: "warning",
		});
	} else if (!/^SPEC-\d{4,}$/.test(id.value)) {
		findings.push({
			file,
			line: id.line,
			rule: "id",
			reason: `invalid id "${id.value}" — must be SPEC- and four digits, such as SPEC-0007`,
			severity: "error",
		});
	}

	if (!fm.get("issue")?.value && status?.value !== "archived" && status?.value !== "superseded") {
		findings.push({
			file,
			line: 1,
			rule: "issue",
			reason: "missing `issue` field — every spec must have a companion GitHub issue",
			severity: "warning",
		});
	}

	return findings;
}
