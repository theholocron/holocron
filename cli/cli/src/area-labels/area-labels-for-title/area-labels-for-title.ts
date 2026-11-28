import { areaForScope } from "../area-for-scope/index.js";
import { AREA_PREFIX } from "../area-prefix/index.js";
import { titleScopes } from "../title-scopes/index.js";

/**
 * The `area:<name>` labels the scopes of an issue's title earn, through `repo.labels.scopes` (spec
 * `tech-github-area-labels`): `feat(sentinel): ...` gives `["area:sentinel"]`. An issue has no changed files, so this is
 * its only source of an area. A title with no scope, or a scope the map does not name, earns nothing; the same area
 * from two scopes is given once, in the order of the title.
 */
export function areaLabelsForTitle(title: string, scopes: Record<string, string> | undefined): string[] {
	const labels: string[] = [];
	for (const scope of titleScopes(title)) {
		const area = areaForScope(scope, scopes);
		if (area === undefined) continue;
		const label = `${AREA_PREFIX}${area}`;
		if (!labels.includes(label)) labels.push(label);
	}
	return labels;
}
