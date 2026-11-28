import type { IssueFieldInput } from "../add-issue-field-options/index.js";
import { isIsoDate } from "../is-iso-date/index.js";
import { resolveAreaLabels } from "../resolve-area-labels/index.js";
import type { PreparedIssueFields } from "./prepare-issue-fields.type.js";

/**
 * Checks the issue-field flags and turns them into what the capability takes. Every problem is reported, not the
 * first: a date that is not `YYYY-MM-DD`, a target before the start, a key that is blank, an area the repo does not
 * declare. `areas` is `repo.labels.areas`.
 */
export function prepareIssueFields(
	input: IssueFieldInput,
	areas: Record<string, string[]> | undefined
): PreparedIssueFields {
	const problems: string[] = [];
	for (const [flag, value] of [
		["--start-date", input.startDate],
		["--target-date", input.targetDate],
	] as const) {
		if (value !== undefined && !isIsoDate(value))
			problems.push(`${flag} must be a date written YYYY-MM-DD, got "${value}"`);
	}
	if (
		input.startDate &&
		input.targetDate &&
		isIsoDate(input.startDate) &&
		isIsoDate(input.targetDate) &&
		input.targetDate < input.startDate
	) {
		problems.push(`--target-date ${input.targetDate} is before --start-date ${input.startDate}`);
	}
	const parent = input.parent?.trim();
	if (input.parent !== undefined && !parent) problems.push("--parent is empty");
	const blockedBy = [...new Set((input.blockedBy ?? []).map((k) => k.trim()).filter(Boolean))];
	if (parent && blockedBy.includes(parent)) problems.push(`${parent} cannot be both the parent and a blocker`);
	const project = input.project?.trim();
	if (input.project !== undefined && !project) problems.push("--project is empty");
	const resolved = resolveAreaLabels(input.areas ?? [], areas);
	if (!resolved.ok) problems.push(resolved.problem);
	const areaLabels = resolved.ok ? resolved.labels : [];
	if (problems.length > 0) return { ok: false, problems };

	return {
		ok: true,
		fields: {
			...(input.kind ? { kind: input.kind } : {}),
			...(input.priority ? { priority: input.priority } : {}),
			...(input.effort ? { effort: input.effort } : {}),
			...(input.startDate ? { startDate: input.startDate } : {}),
			...(input.targetDate ? { targetDate: input.targetDate } : {}),
			...(parent ? { parent } : {}),
			...(blockedBy.length > 0 ? { blockedBy } : {}),
		},
		areaLabels,
		...(project ? { project } : {}),
	};
}
