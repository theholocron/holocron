import type { IssueTypeDeclaration, IssueTypeInfo } from "../../../plugin/index.js";
import type { IssueTypesPlan, TypeAction, TypeChange } from "./plan-issue-types.type.js";

/**
 * Compares the declared Types with the organization's, by name ignoring case. A missing one is made; with `update` an
 * existing one whose stated description or colour differs is updated (only those two fields, only when the declaration
 * states them). `enabled` and the name are never compared: a Type is never renamed, turned on or off, or deleted.
 */
export function planIssueTypes(
	declared: readonly IssueTypeDeclaration[],
	existing: readonly IssueTypeInfo[],
	update: boolean
): IssueTypesPlan {
	const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));
	const actions: TypeAction[] = declared.map((d): TypeAction => {
		const have = byName.get(d.name.toLowerCase());
		if (!have) return { kind: "create", declared: d };
		const changes: TypeChange[] = [];
		if (update) {
			if (d.description !== undefined && d.description !== (have.description ?? "")) {
				changes.push({ field: "description", was: have.description ?? "", to: d.description });
			}
			if (d.color !== undefined && d.color !== (have.color ?? "")) {
				changes.push({ field: "color", was: have.color ?? "", to: d.color });
			}
		}
		return changes.length > 0
			? { kind: "update", declared: d, existing: have, changes }
			: { kind: "exists", declared: d, existing: have };
	});
	return { actions, total: existing.length + actions.filter((a) => a.kind === "create").length };
}
