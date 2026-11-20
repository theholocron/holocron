import { AREA_PREFIX } from "../../../area-labels/area-prefix/index.js";
import type { AreaLabelsResult } from "./resolve-area-labels.type.js";

/**
 * Turns area names into their labels, checking each against the areas the repo declares in `repo.labels.areas`. A name
 * is matched without regard to case and may be given with its `area:` prefix. A repo that declares no areas, or a name it
 * does not declare, is a problem naming what is declared, so a typo never makes a label.
 */
export function resolveAreaLabels(
	names: readonly string[],
	declared: Record<string, string[]> | undefined
): AreaLabelsResult {
	if (names.length === 0) return { ok: true, labels: [] };
	const known = Object.keys(declared ?? {});
	if (known.length === 0) {
		return { ok: false, problem: "--area needs `repo.labels.areas` in the config, and this repo declares none" };
	}
	const labels: string[] = [];
	for (const raw of names) {
		const name = raw
			.trim()
			.replace(/^area:/i, "")
			.toLowerCase();
		const match = known.find((k) => k.toLowerCase() === name);
		if (!match) return { ok: false, problem: `unknown area "${raw}"; the declared areas are ${known.join(", ")}` };
		const label = `${AREA_PREFIX}${match}`;
		if (!labels.includes(label)) labels.push(label);
	}
	return { ok: true, labels };
}
