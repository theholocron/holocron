const BLOCK = /^---(\r?\n)([\s\S]*?)(\r?\n)---/;

/**
 * The note's text with `issue: <key>` in its frontmatter: a blank `issue:` line is filled in, else a line is added at
 * the end of the block. Everything else, including line endings and the body, is left byte for byte. A note with no
 * frontmatter is returned unchanged (such a note has no `status:`, so it is never filed).
 */
export function writeIssueKey(text: string, key: string): string {
	const match = BLOCK.exec(text);
	if (!match) return text;
	const [whole, open, inner, close] = match as unknown as [string, string, string, string];
	const lines = inner.split(/\r?\n/);
	const separators = inner.match(/\r?\n/g) ?? [];
	const at = lines.findIndex((line) => /^issue:/.test(line));
	const next = at === -1 ? [...lines, `issue: ${key}`] : lines.map((line, i) => (i === at ? `issue: ${key}` : line));
	// Each line keeps the ending it had; an added line takes the one before the closing fence.
	let rebuilt = next[0]!;
	next.slice(1).forEach((line, i) => {
		rebuilt += (separators[i] ?? close) + line;
	});
	return `---${open}${rebuilt}${close}---${text.slice(whole.length)}`;
}
