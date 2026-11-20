/**
 * The kind of an issue on an `IssueRecord` (spec `tech-issue-kind-on-record`, #2485): read from the issue Type, else
 * from the kind labels, and written as the Type.
 */

import type { IssueKind } from "@theholocron/cli";
import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";

import { fieldRefusal } from "./issue-field-setter.js";

/** The Type name of each kind. */
export const KIND_TYPE_NAMES: Record<IssueKind, string> = { bug: "Bug", feature: "Feature", task: "Task" };

/** The kind each label names where there is no Type. */
const LABEL_KINDS: Record<string, IssueKind> = { bug: "bug", enhancement: "feature", chore: "task" };

const TYPE_KINDS = new Map<string, IssueKind>(
	(Object.entries(KIND_TYPE_NAMES) as Array<[IssueKind, string]>).map(([kind, name]) => [name.toLowerCase(), kind])
);

/** The kind of an issue: its Type, else the one kind its labels name (two different ones name none). */
export function kindOfIssue(issue: GitHubIssue): IssueKind | undefined {
	const typed = TYPE_KINDS.get(issue.type?.name?.toLowerCase() ?? "");
	if (typed) return typed;
	const named = new Set(issue.labels.flatMap((l) => LABEL_KINDS[l.name.toLowerCase()] ?? []));
	return named.size === 1 ? [...named][0] : undefined;
}

/** Whether the issue's Type is already the kind's. */
export function hasKindType(issue: GitHubIssue, kind: IssueKind): boolean {
	return issue.type?.name?.toLowerCase() === KIND_TYPE_NAMES[kind].toLowerCase();
}

/** Sets the Type of issue `number`; a refusal is returned as a `dropped` line, anything else (a rate limit) is thrown. */
export async function writeKind(
	client: GitHubClient,
	repo: string,
	number: number,
	kind: IssueKind
): Promise<string | undefined> {
	const name = KIND_TYPE_NAMES[kind];
	try {
		await client.issues.updateIssue(repo, number, { type: name });
		return undefined;
	} catch (err) {
		const why = fieldRefusal(err);
		if (why === undefined) throw err;
		return `kind ${name} (${why})`;
	}
}
