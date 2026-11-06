/**
 * Rewrite `FROM node:N` (any tag suffix is kept) in a Dockerfile.
 *
 * @param content - The raw Dockerfile text.
 * @param from - The major being replaced.
 * @param to - The major to pin.
 * @returns The new text, or `null` when nothing changed.
 */
export function patchDockerfile(content: string, from: number, to: number): string | null {
	const updated = content.replace(/^(FROM\s+node:)(\d+)/gm, (match, prefix, ver) =>
		ver === String(from) ? `${prefix}${to}` : match
	);
	return updated !== content ? updated : null;
}
