import type { BackfillItem } from "./issue-types.type.js";

/** The kind labels and the Type each one means (spec `tech-github-area-labels`, decision 3). */
export const KIND_TYPES: Record<string, string> = { bug: "Bug", enhancement: "Feature", chore: "Task" };

/** The other kind labels, which mean Task only when none of the three above is on the issue (issue #2494). */
export const OTHER_KIND_LABELS: readonly string[] = [
	"ci",
	"documentation",
	"refactor",
	"test",
	"performance",
	"dependencies",
];

/** What the Type of one issue should be: a value to set, or the reason it is left alone. */
export type TypePlan =
	{ set: string } | { skip: "typed" } | { skip: "no-kind-label" } | { skip: "ambiguous"; labels: string[] };

/**
 * The Type an issue gets from its kind labels. One that has a Type keeps it, whatever its labels say; one with exactly
 * one of `bug`, `enhancement` and `chore` gets that label's Type; one with two or more is `ambiguous` and left for a
 * person (the spec's rule: the probe never picks between two kinds). An issue with none of the three but one or more of
 * `ci`, `documentation`, `refactor`, `test`, `performance` and `dependencies` gets Task: the three always win, and the
 * others all mean Task, so they never conflict. One with no label that maps to a Type has no source.
 */
export function planType(item: Pick<BackfillItem, "type" | "labels">): TypePlan {
	if (item.type) return { skip: "typed" };
	const kinds = [...new Set(item.labels.map((l) => l.toLowerCase()).filter((l) => l in KIND_TYPES))];
	if (kinds.length === 0) {
		const others = item.labels.some((l) => OTHER_KIND_LABELS.includes(l.toLowerCase()));
		return others ? { set: "Task" } : { skip: "no-kind-label" };
	}
	if (kinds.length > 1) return { skip: "ambiguous", labels: kinds };
	return { set: KIND_TYPES[kinds[0]] };
}
