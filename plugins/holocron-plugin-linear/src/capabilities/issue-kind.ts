/**
 * The kind of an issue on an `IssueRecord` (spec `tech-issue-kind-on-record`, #2485): Linear has no Type, so it is
 * read from and written as the kind label (`KIND_LABELS`).
 */

import type { IssueKind } from "@theholocron/cli";

import { KIND_LABELS } from "./issues-update.js";

const LABEL_KINDS = new Map<string, IssueKind>(
	(Object.entries(KIND_LABELS) as Array<[IssueKind, string]>).map(([kind, label]) => [label, kind])
);

/** The one kind the labels name; two different kinds name none. */
export function kindOfLabels(names: string[]): IssueKind | undefined {
	const named = new Set(names.flatMap((n) => LABEL_KINDS.get(n.toLowerCase()) ?? []));
	return named.size === 1 ? [...named][0] : undefined;
}

/** The labels a record becomes: its own, plus its kind's label when they do not already name it. */
export function labelsFor(record: { labels: string[]; kind?: IssueKind }): string[] {
	if (!record.kind) return record.labels;
	const label = KIND_LABELS[record.kind];
	return record.labels.some((n) => n.toLowerCase() === label) ? record.labels : [...record.labels, label];
}
