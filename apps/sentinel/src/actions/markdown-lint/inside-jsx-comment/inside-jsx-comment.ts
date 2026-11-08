const JSX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;

/**
 * Whether the span `[column, column + length)` of line `lineNumber` (both 1-indexed, as markdownlint reports a
 * finding) lies wholly inside an MDX comment, `{/* … *\/}`, which may run over several lines. markdownlint parses
 * Markdown and not MDX, so it reads such a comment as emphasis and flags its spaces (MD037); the comment is not text.
 */
export function insideJsxComment(content: string, lineNumber: number, column: number, length = 1): boolean {
	const lines = content.split("\n");
	let offset = 0;
	for (let i = 0; i < lineNumber - 1; i++) offset += (lines[i]?.length ?? 0) + 1;
	const start = offset + column - 1;
	const end = start + Math.max(length, 1);
	for (const match of content.matchAll(JSX_COMMENT)) {
		const from = match.index;
		if (start >= from && end <= from + match[0].length) return true;
	}
	return false;
}
