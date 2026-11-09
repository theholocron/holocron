const BLOCK = /^---(\r?\n)([\s\S]*?)(\r?\n)---/;

/**
 * The note's text with `<name>: <value>` in its frontmatter: an existing `<name>:` line (blank or not) is replaced in
 * place, else a line is added at the end of the block. Everything else, including line endings and the body, is left
 * byte for byte. A note with no frontmatter is returned unchanged (such a note has no `status:`, so it is never filed).
 * `name` is a plain property name (`status`, `issue`).
 */
export function writeProperty(text: string, name: string, value: string): string {
	const match = BLOCK.exec(text);
	if (!match) return text;
	const [whole, open, inner, close] = match as unknown as [string, string, string, string];
	const lines = inner.split(/\r?\n/);
	const separators = inner.match(/\r?\n/g) ?? [];
	const line = `${name}: ${value}`;
	const at = lines.findIndex((l) => l.startsWith(`${name}:`));
	const next = at === -1 ? [...lines, line] : lines.map((l, i) => (i === at ? line : l));
	// Each line keeps the ending it had; an added line takes the one before the closing fence.
	let rebuilt = next[0]!;
	next.slice(1).forEach((l, i) => {
		rebuilt += (separators[i] ?? close) + l;
	});
	return `---${open}${rebuilt}${close}---${text.slice(whole.length)}`;
}
