/**
 * How a commit trailer or a pull request names an issue so the tracker links it. GitHub links `#2500`, not `2500`, so a
 * bare number gets the `#`; `#12`, `owner/repo#12` and a tracker's own key (`ENG-42`) are kept as they are.
 */
export function workReference(key: string): string {
	const trimmed = key.trim();
	return /^\d+$/.test(trimmed) ? `#${trimmed}` : trimmed;
}
