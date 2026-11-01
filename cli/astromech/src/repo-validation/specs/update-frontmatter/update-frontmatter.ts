import type { FrontmatterChanges } from "../specs.type.js";

/** The lines of the front matter block, between the two `---` lines. */
const BLOCK = /^---\n([\s\S]*?)\n---/;

/** Sets `key: value` on its own line, replacing the line that has the key or adding one at the end of the block. */
function setField(lines: string[], key: string, value: string): string[] {
	const at = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
	if (at === -1) return [...lines, `${key}: ${value}`];
	return lines.map((line, i) => (i === at ? `${key}: ${value}` : line));
}

/**
 * Sets `discussion.url`. The block under `discussion:` is kept: a `url:` line there is replaced, else one is added right
 * under the key, so a `github:` link beside it stays. A `discussion:` that holds a plain value becomes a block that keeps
 * the value as `github:`, and a document with no `discussion:` gets one at the end of the front matter.
 */
function setDiscussionUrl(lines: string[], url: string): string[] {
	const at = lines.findIndex((line) => /^discussion:/.test(line));
	if (at === -1) return [...lines, "discussion:", `  url: ${url}`];

	const inline = lines[at]!.slice("discussion:".length).trim();
	if (inline !== "")
		return [...lines.slice(0, at), "discussion:", `  github: ${inline}`, `  url: ${url}`, ...lines.slice(at + 1)];

	let end = at + 1;
	while (end < lines.length && /^\s+\S/.test(lines[end]!)) end++;
	const existing = lines.slice(at + 1, end).findIndex((line) => /^\s+url:/.test(line));
	if (existing !== -1) {
		return lines.map((line, i) => (i === at + 1 + existing ? `  url: ${url}` : line));
	}
	return [...lines.slice(0, at + 1), `  url: ${url}`, ...lines.slice(at + 1)];
}

/**
 * A document's text with its front matter changed: `status` set, and `discussion.url` set to the address of its discussion
 * post. Nothing else in the file moves: the other fields, their order and the body are left as they were. A document
 * with no front matter is returned unchanged.
 */
export function updateFrontmatter(text: string, changes: FrontmatterChanges): string {
	const match = BLOCK.exec(text);
	if (!match) return text;
	let lines = match[1]!.split("\n");
	if (changes.status !== undefined) lines = setField(lines, "status", changes.status);
	if (changes.discussionUrl !== undefined) lines = setDiscussionUrl(lines, changes.discussionUrl);
	return `---\n${lines.join("\n")}\n---${text.slice(match[0].length)}`;
}
