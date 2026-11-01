/** The longest title an announcement carries. */
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
 * A spec's title for a chat post: its first `# ` heading after the frontmatter, else its file name without `.spec.md`.
 * What the file says is written by whoever opened the pull request, so the result carries no markdown, brackets or
 * line breaks that could turn it into a link or a layout of its own.
 */
export function specTitle(path: string, text: string): string {
	const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
	const heading = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body)?.[1];
	const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.spec\.md$/, "");
	return (heading === undefined ? "" : plain(heading)) || plain(name);
}
