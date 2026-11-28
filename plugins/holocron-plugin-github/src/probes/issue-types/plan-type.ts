import type { BackfillItem } from "./issue-types.type.js";
import type { KindTables } from "./kinds.js";

/** What the Type of one issue should be: a value to set, or the reason it is left alone. */
export type TypePlan =
	{ set: string } | { skip: "typed" } | { skip: "no-kind-label" } | { skip: "ambiguous"; labels: string[] };

/** The labels of an issue that `table` knows, each once (lower case), in the issue's order. */
const matching = (labels: readonly string[], table: Record<string, string>) => [
	...new Set(labels.map((l) => l.toLowerCase()).filter((l) => Object.hasOwn(table, l))),
];

/**
 * The Type an issue gets from its kind labels. One that has a Type keeps it, whatever its labels say. Otherwise the main
 * table decides (`bug`, `enhancement`, `chore` by default), and only an issue with none of those looks at the fallback
 * table (`ci`, `documentation`, `refactor`, `test`, `performance`, `dependencies`, all Task by default; #2494). Labels
 * that point to one Type set it, however many they are; labels that point to two different Types are `ambiguous` and left
 * for a person (the spec's rule: the probe never picks between two kinds); one with no label in either table has no source.
 */
export function planType(item: Pick<BackfillItem, "type" | "labels">, kinds: KindTables): TypePlan {
	if (item.type) return { skip: "typed" };
	for (const table of [kinds.main, kinds.fallback]) {
		const found = matching(item.labels, table);
		if (found.length === 0) continue;
		if (new Set(found.map((l) => table[l])).size > 1) return { skip: "ambiguous", labels: found };
		return { set: table[found[0]] };
	}
	return { skip: "no-kind-label" };
}
