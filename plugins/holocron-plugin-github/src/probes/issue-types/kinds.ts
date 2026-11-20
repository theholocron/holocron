import type { LabelsConfig } from "./issue-types.type.js";

/** The two tables of kind labels, each label (lower case) to the Type it means (spec `tech-backfill-config-mapping`). */
export interface KindTables {
	/** The main labels; they always win over `fallback`. */
	main: Record<string, string>;
	/** Used only when an issue has none of the main labels. */
	fallback: Record<string, string>;
}

/** The kind labels and the Type each one means (spec `tech-github-area-labels`, decision 3). */
export const DEFAULT_MAIN_KINDS: Record<string, string> = { bug: "Bug", enhancement: "Feature", chore: "Task" };

/** The other kind labels, which mean Task only when none of the main ones is on the issue (issue #2494). */
export const DEFAULT_FALLBACK_KINDS: Record<string, string> = Object.fromEntries(
	["ci", "documentation", "refactor", "test", "performance", "dependencies"].map((label) => [label, "Task"])
);

const lowered = (table: Record<string, string>) =>
	Object.fromEntries(Object.entries(table).map(([label, type]) => [label.toLowerCase(), type]));

/** The tables a run uses: what `repo.labels` sets, else the defaults, table by table. */
export function resolveKinds(config: Pick<LabelsConfig, "kinds" | "fallbackKinds">): KindTables {
	return {
		main: config.kinds ? lowered(config.kinds) : DEFAULT_MAIN_KINDS,
		fallback: config.fallbackKinds ? lowered(config.fallbackKinds) : DEFAULT_FALLBACK_KINDS,
	};
}

/** The Types the tables name that `known` (the organization's Types) lacks, each with the labels that use it. */
export function unknownTypes(kinds: KindTables, known: ReadonlySet<string>): Array<{ type: string; labels: string[] }> {
	const byType = new Map<string, string[]>();
	for (const [label, type] of [...Object.entries(kinds.main), ...Object.entries(kinds.fallback)]) {
		if (!known.has(type)) byType.set(type, [...(byType.get(type) ?? []), label]);
	}
	return [...byType].map(([type, labels]) => ({ type, labels }));
}
