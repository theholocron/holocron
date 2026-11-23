/**
 * The kind of an issue on an `IssueRecord` (spec `tech-issue-kind-on-record`, #2485): read from the issue Type, else
 * from the kind labels, and written as the Type. The Types are the core three plus the ones the organization declares
 * (`issueTypes`, spec `tech-org-issue-types`, #2512).
 */

import type { IssueKind } from "@theholocron/cli";
import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";

import { fieldRefusal } from "./issue-field-setter.js";

/** The Type name of each core kind; always known, whatever is declared. */
const CORE_TYPE_NAMES: Record<string, string> = { bug: "Bug", feature: "Feature", task: "Task" };

/** The kind each label names where there is no Type. */
const LABEL_KINDS: Record<string, IssueKind> = { bug: "bug", enhancement: "feature", chore: "task" };

/** The Type name of each kind this run knows. */
export interface KindNames {
	/** The Type name a kind is written as: the declared spelling, else the kind with its first letter in capitals. */
	nameOf(kind: IssueKind): string;
	/** The kind a Type name stands for: the lower-case name, whether or not it is declared. */
	kindOf(typeName: string | undefined): IssueKind | undefined;
}

/** The core three Types plus the declared ones (in the declaration's spelling); a core name wins over a declared one. */
export function kindNames(declared: ReadonlyArray<{ name: string }> | undefined): KindNames {
	const names = new Map<string, string>(Object.entries(CORE_TYPE_NAMES));
	for (const { name } of declared ?? []) if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
	return {
		nameOf: (kind) => names.get(kind) ?? kind.charAt(0).toUpperCase() + kind.slice(1),
		kindOf: (typeName) => (typeName ? typeName.toLowerCase() : undefined),
	};
}

/** The names with nothing declared. */
export const CORE_KIND_NAMES: KindNames = kindNames(undefined);

/**
 * The kind of an issue: its Type (a Type outside the core three is its lower-case name, so a migration does not lose an
 * Epic), else the one kind its labels name (two different ones name none).
 */
export function kindOfIssue(issue: GitHubIssue, names: KindNames = CORE_KIND_NAMES): IssueKind | undefined {
	const typed = names.kindOf(issue.type?.name);
	if (typed) return typed;
	const named = new Set(issue.labels.flatMap((l) => LABEL_KINDS[l.name.toLowerCase()] ?? []));
	return named.size === 1 ? [...named][0] : undefined;
}

/** Whether the issue's Type is already the kind's. */
export function hasKindType(issue: GitHubIssue, kind: IssueKind, names: KindNames = CORE_KIND_NAMES): boolean {
	return issue.type?.name?.toLowerCase() === names.nameOf(kind).toLowerCase();
}

/** Sets the Type of issue `number`; a refusal is returned as a `dropped` line, anything else (a rate limit) is thrown. */
export async function writeKind(
	client: GitHubClient,
	repo: string,
	number: number,
	kind: IssueKind,
	names: KindNames = CORE_KIND_NAMES
): Promise<string | undefined> {
	const name = names.nameOf(kind);
	try {
		await client.issues.updateIssue(repo, number, { type: name });
		return undefined;
	} catch (err) {
		const why = fieldRefusal(err);
		if (why === undefined) throw err;
		return `kind ${name} (${why})`;
	}
}
