import type { DiscussionBodyInput } from "../specs.type.js";

/**
 * The line of a discussion post's first message that names the document: its id (`SPEC-0007`), and, once the file is on
 * the default branch, the id as a link to the file at its path there: `[SPEC-0007](<address>)`. The address is
 * `https://github.com/<repo>/blob/<branch>/<path>`, kept in angle brackets so the chat service does not expand it into a
 * preview card. Plain text when `file` is not given: while a pull request is open its `PR:` line is the link, and a blob
 * address on a branch where the file does not yet exist leads nowhere. {@link discussionBody} writes it, a file that moved
 * is given its new address with it, and a repair of existing posts compares against it.
 */
export function discussionIdLine(id: string, file: DiscussionBodyInput["file"]): string {
	if (!file) return id;
	const escape = (path: string): string => path.split("/").map(encodeURIComponent).join("/");
	return `[${id}](<https://github.com/${file.repo}/blob/${escape(file.branch)}/${escape(file.path)}>)`;
}
