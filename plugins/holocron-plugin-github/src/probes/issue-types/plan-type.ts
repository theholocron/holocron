import type { BackfillItem } from "./issue-types.type.js";

/** The kind labels and the Type each one means (spec `tech-github-area-labels`, decision 3). */
export const KIND_TYPES: Record<string, string> = { bug: "Bug", enhancement: "Feature", chore: "Task" };

/** What the Type of one issue should be: a value to set, or the reason it is left alone. */
export type TypePlan =
	{ set: string } | { skip: "typed" } | { skip: "no-kind-label" } | { skip: "ambiguous"; labels: string[] };

/**
 * The Type an issue gets from its kind labels. One that has a Type keeps it, whatever its labels say; one with exactly
 * one of `bug`, `enhancement` and `chore` gets that label's Type; one with two or more is `ambiguous` and left for a
 * person (the spec's rule: the probe never picks between two kinds); one with none has no source.
 */
export function planType(item: Pick<BackfillItem, "type" | "labels">): TypePlan {
	if (item.type) return { skip: "typed" };
	const kinds = [...new Set(item.labels.map((l) => l.toLowerCase()).filter((l) => l in KIND_TYPES))];
	if (kinds.length === 0) return { skip: "no-kind-label" };
	if (kinds.length > 1) return { skip: "ambiguous", labels: kinds };
	return { set: KIND_TYPES[kinds[0]] };
}
