/**
 * Rewrite a `.nvmrc` / `.node-version` file holding `N` or `N.x.y`.
 *
 * @param content - The raw file text.
 * @param from - The major being replaced.
 * @param to - The major to pin.
 * @returns `"<to>\n"`, or `null` when the file pins a different major.
 */
export function patchPinFile(content: string, from: number, to: number): string | null {
	const trimmed = content.trim();
	if (trimmed === String(from) || trimmed.startsWith(`${from}.`)) {
		return `${to}\n`;
	}
	return null;
}
