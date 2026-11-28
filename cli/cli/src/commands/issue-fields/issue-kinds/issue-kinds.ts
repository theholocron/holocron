import type { OrgIssueType } from "../../../config/index.js";
import type { CoreIssueKind, IssueKind } from "../../../plugin/index.js";

/** The kinds the CLI always knows (GitHub's default issue Types), whatever the organization declares. */
export const CORE_KINDS: readonly CoreIssueKind[] = ["bug", "feature", "task"];

/**
 * The kinds `--type` accepts (spec `tech-org-issue-types`, #2512): the core three, then each declared Type's name in
 * lower case, in the declaration's order. A declared name equal to a core one is that core kind, so it is listed once.
 * This is the one place the list is built.
 */
export function issueKinds(types: readonly Pick<OrgIssueType, "name">[] | undefined): IssueKind[] {
	return [...new Set<IssueKind>([...CORE_KINDS, ...(types ?? []).map((t) => t.name.toLowerCase())])];
}

/** What is wrong with a `--type` value, or `undefined` when it is a kind this run knows. Case is ignored. */
export function kindProblem(
	value: string | undefined,
	types: readonly Pick<OrgIssueType, "name">[] | undefined
): string | undefined {
	if (value === undefined) return undefined;
	const kinds = issueKinds(types);
	if (kinds.includes(value.toLowerCase())) return undefined;
	return `--type ${JSON.stringify(value)} is not a kind this organization knows. Use one of: ${kinds.join(", ")}`;
}
