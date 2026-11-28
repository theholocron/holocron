/**
 * The area a title scope means, by `repo.labels.scopes` (spec `tech-github-area-labels`): `sentinel` gives the area it is
 * mapped to. The scope is matched without regard to case; a scope the map does not name, or a repo with no map, gives
 * `undefined`. It is the area's name, not its label: `areaLabelsForTitle()` adds the prefix.
 */
export function areaForScope(scope: string, scopes: Record<string, string> | undefined): string | undefined {
	const wanted = scope.trim().toLowerCase();
	for (const [name, area] of Object.entries(scopes ?? {})) {
		if (name.toLowerCase() === wanted) return area;
	}
	return undefined;
}
