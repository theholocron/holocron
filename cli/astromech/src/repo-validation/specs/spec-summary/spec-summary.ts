/** The longest summary a post carries; a chat message caps near 2000 and the post adds a link and a footer. */
const MAX_SUMMARY = 1000;

/** The headings whose first paragraph says what the document is for, in the order they are looked for. */
const SUMMARY_HEADINGS = /^#{2,3}[ \t]+(problem|why|context|summary|overview)[ \t]*#*[ \t]*$/i;

/**
 * The first paragraph of a block of lines starting at `from`: skips blank lines, then reads lines up to the next blank
 * one. A heading, a table row or a code fence is not a paragraph, so the search goes on past it.
 */
function paragraphFrom(lines: readonly string[], from: number): string | undefined {
	let i = from;
	while (i < lines.length) {
		const line = lines[i]!;
		if (line.startsWith("```")) {
			// A fenced block is not prose: skip to the line that closes it (or to the end when it never does).
			i++;
			while (i < lines.length && !lines[i]!.startsWith("```")) i++;
			i++;
			continue;
		}
		if (line.trim() === "" || /^(#|\|)/.test(line)) {
			i++;
			continue;
		}
		const block: string[] = [];
		while (i < lines.length && lines[i]!.trim() !== "") block.push(lines[i++]!.trimEnd());
		return block.join("\n");
	}
	return undefined;
}

/**
 * A short summary of a spec or ADR for a discussion post: the first paragraph under a `Problem`, `Why`, `Context`,
 * `Summary` or `Overview` heading, else the first paragraph after the title, cut with an ellipsis at 1000 characters.
 * Empty when the document has no paragraph at all. The post links to the file for the rest; the text is not mirrored.
 */
export function specSummary(text: string): string {
	const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
	const lines = body.split("\n");
	const at = lines.findIndex((line) => SUMMARY_HEADINGS.test(line));
	const found = (at === -1 ? undefined : paragraphFrom(lines, at + 1)) ?? paragraphFrom(lines, 0) ?? "";
	return found.length > MAX_SUMMARY ? `${found.slice(0, MAX_SUMMARY - 1)}…` : found;
}
