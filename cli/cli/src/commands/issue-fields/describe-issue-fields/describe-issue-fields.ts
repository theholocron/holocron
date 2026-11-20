import type { IssueFields } from "../../../plugin/index.js";

/** One short phrase per field that is set, for the confirmation question and the dry-run line: `type: bug`. */
export function describeIssueFields(fields: IssueFields, project?: string): string[] {
	return [
		fields.kind ? `type: ${fields.kind}` : undefined,
		fields.priority ? `priority: ${fields.priority}` : undefined,
		fields.effort ? `effort: ${fields.effort}` : undefined,
		fields.startDate ? `start: ${fields.startDate}` : undefined,
		fields.targetDate ? `target: ${fields.targetDate}` : undefined,
		fields.parent ? `parent: ${fields.parent}` : undefined,
		fields.blockedBy?.length ? `blocked by: ${fields.blockedBy.join(", ")}` : undefined,
		project ? `board: ${project}` : undefined,
	].filter((d): d is string => d !== undefined);
}
