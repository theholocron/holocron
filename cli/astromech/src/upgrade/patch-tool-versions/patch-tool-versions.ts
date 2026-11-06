/**
 * Rewrite the `nodejs N` line in an asdf `.tool-versions` file.
 *
 * @param content - The raw file text.
 * @param from - The major being replaced.
 * @param to - The major to pin.
 * @returns The new text, or `null` when nothing changed.
 */
export function patchToolVersions(content: string, from: number, to: number): string | null {
	const updated = content.replace(/^(nodejs\s+)(\d+)/gm, (match, prefix, ver) =>
		ver === String(from) ? `${prefix}${to}` : match
	);
	return updated !== content ? updated : null;
}
