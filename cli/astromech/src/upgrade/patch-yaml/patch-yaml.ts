/**
 * Rewrite `node-version: N` (bare, single- or double-quoted) in a YAML file such as a GitHub Actions workflow.
 *
 * @param content - The raw YAML text.
 * @param from - The major being replaced.
 * @param to - The major to pin.
 * @returns The new text, or `null` when nothing changed.
 */
export function patchYaml(content: string, from: number, to: number): string | null {
	const updated = content.replace(/node-version:\s+['"]?(\d+)['"]?/g, (match, ver) =>
		ver === String(from) ? match.replace(String(from), String(to)) : match
	);
	return updated !== content ? updated : null;
}
