/**
 * The kind of an issue on an `IssueRecord` (spec `tech-issue-kind-on-record`, #2485): Linear has no Type, so it is
 * read from and written as the kind label. The labels are the core three plus the one each Type the organization
 * declares (`issueTypes`, spec `tech-org-issue-types`, #2512) names: its `label`, else its name in lower case.
 */

import type { IssueKind } from "@theholocron/cli";

/** The canonical label that stands for each core kind where there is no Type. */
const CORE_LABELS: Record<string, string> = { bug: "bug", feature: "enhancement", task: "chore" };

/** What an issue Type declares that Linear needs. */
export interface DeclaredKind {
	/** The Type's name. */
	name: string;
	/** The Linear label that stands for it. Default: the name in lower case (a core kind keeps its own label). */
	label?: string;
}

/** The label of each kind this run knows. */
export interface KindLabels {
	/** The label a kind is written as; `undefined` for a kind with no label (the record then drops it). */
	labelOf(kind: IssueKind): string | undefined;
	/** The kind a label names, whatever its case; `undefined` for a label that is none of the table's. */
	kindOf(label: string): IssueKind | undefined;
	/** Every kind label. */
	labels(): string[];
}

/** The core three labels plus each declared Type's, in the declaration's order. */
export function kindLabels(declared: ReadonlyArray<DeclaredKind> | undefined): KindLabels {
	const byKind = new Map<string, string>(Object.entries(CORE_LABELS));
	for (const { name, label } of declared ?? []) {
		const kind = name.toLowerCase();
		byKind.set(kind, label ?? byKind.get(kind) ?? kind);
	}
	const byLabel = new Map<string, IssueKind>([...byKind].map(([kind, label]) => [label.toLowerCase(), kind]));
	return {
		labelOf: (kind) => byKind.get(kind),
		kindOf: (label) => byLabel.get(label.toLowerCase()),
		labels: () => [...byKind.values()],
	};
}

/** The labels with nothing declared. */
export const CORE_KIND_LABELS: KindLabels = kindLabels(undefined);

/** The one kind the labels name; two different kinds name none. */
export function kindOfLabels(names: string[], kinds: KindLabels = CORE_KIND_LABELS): IssueKind | undefined {
	const named = new Set(names.flatMap((n) => kinds.kindOf(n) ?? []));
	return named.size === 1 ? [...named][0] : undefined;
}

/** The labels a record becomes: its own, plus its kind's label when they do not already name it. */
export function labelsFor(
	record: { labels: string[]; kind?: IssueKind },
	kinds: KindLabels = CORE_KIND_LABELS
): string[] {
	if (!record.kind) return record.labels;
	const label = kinds.labelOf(record.kind);
	if (label === undefined) return record.labels;
	return record.labels.some((n) => n.toLowerCase() === label.toLowerCase())
		? record.labels
		: [...record.labels, label];
}

/** The `dropped` line for a record whose kind has no label here, or `undefined` when it is carried (or has no kind). */
export function droppedKind(record: { kind?: IssueKind }, kinds: KindLabels = CORE_KIND_LABELS): string | undefined {
	return record.kind !== undefined && kinds.labelOf(record.kind) === undefined
		? `kind ${record.kind} (not carried: no Linear label)`
		: undefined;
}
