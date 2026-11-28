/** The longest title a discussion post carries. */
const MAX_TITLE = 100;

/** Text with the characters that format or link in a chat message removed, runs of whitespace collapsed, and a cap on its length. */
function plain(text: string): string {
	const cleaned = text
		.replace(/[[\]()<>`*_~|\\]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned.length > MAX_TITLE ? `${cleaned.slice(0, MAX_TITLE - 1)}…` : cleaned;
}

/**
 * The text of the first `# ` heading of `body` (closing `#`s and the spaces around them dropped), or `undefined`. Read one
 * line at a time from both ends, not with a pattern, so a long run of spaces or hashes costs one pass.
 */
function firstHeading(body: string): string | undefined {
	const blank = (c: string | undefined) => c === " " || c === "\t";
	for (const raw of body.split("\n")) {
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		if (line[0] !== "#" || !blank(line[1])) continue;
		let start = 1;
		while (blank(line[start])) start += 1;
		let end = line.length;
		while (end > start && blank(line[end - 1])) end -= 1;
		while (end > start && line[end - 1] === "#") end -= 1;
		while (end > start && blank(line[end - 1])) end -= 1;
		// A heading made only of `#`s is its own text, as the one character it must have.
		const text = end > start ? line.slice(start, end) : line.slice(start, start + 1);
		if (text !== "") return text;
	}
	return undefined;
}

/**
 * A spec's title for a chat post: its first `# ` heading after the frontmatter, else its file name without `.spec.md`.
 * What the file says is written by whoever opened the pull request, so the result carries no markdown, brackets or
 * line breaks that could turn it into a link or a layout of its own.
 */
export function specTitle(path: string, text: string): string {
	const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
	const heading = firstHeading(body);
	const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.spec\.md$/, "");
	return (heading === undefined ? "" : plain(heading)) || plain(name);
}
