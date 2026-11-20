import type { LabelDef } from "../../plugin/index.js";
import { AREA_PREFIX } from "../area-prefix/index.js";

/** The colour of every area label: one family, one colour (spec `tech-github-area-labels`). */
export const AREA_LABEL_COLOR = "c5def5";

/** GitHub refuses a label description longer than this. */
const MAX_DESCRIPTION = 100;

/**
 * The labels `holocron setup` makes for the areas a repo declares: `area:<name>`, the one family colour and the
 * description `Changes under <paths>` from the area's own (not excluded) patterns, cut to GitHub's 100 characters. They
 * are never part of `CANONICAL_LABELS`: an area names this repo's folders, so another repo has none of them.
 */
export function areaLabelDefs(areas: Record<string, string[]> | undefined): LabelDef[] {
	return Object.entries(areas ?? {}).map(([name, patterns]) => {
		const text = `Changes under ${patterns.filter((p) => !p.startsWith("!")).join(", ")}`;
		const description = text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1)}…` : text;
		return { name: `${AREA_PREFIX}${name}`, color: AREA_LABEL_COLOR, description };
	});
}
