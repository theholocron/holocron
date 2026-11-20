import { AREA_PREFIX } from "../../issue-fields/resolve-area-labels/index.js";
import { pathMatches } from "../path-matches/index.js";

/**
 * The `area:<name>` labels a set of changed paths earns, in the order the areas are declared (spec
 * `tech-github-area-labels`). An area's patterns are the ones in `repo.labels.areas`; one starting with `!` takes a path
 * out of the area (`docs/**` with `!docs/wiki/**`), so a path is in an area when some pattern includes it and none
 * excludes it. A path in no area earns nothing, which is right, not a failure. This is the one mapping from changed
 * folders to labels in the CLI; Sentinel's `planAreaLabels()` is meant to agree with it.
 */
export function areaLabelsForFiles(files: readonly string[], areas: Record<string, string[]> | undefined): string[] {
	const labels: string[] = [];
	for (const [name, patterns] of Object.entries(areas ?? {})) {
		const include = patterns.filter((p) => !p.startsWith("!"));
		const exclude = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1));
		const hit = files.some(
			(file) => include.some((p) => pathMatches(file, p)) && !exclude.some((p) => pathMatches(file, p))
		);
		if (hit) labels.push(`${AREA_PREFIX}${name}`);
	}
	return labels;
}
