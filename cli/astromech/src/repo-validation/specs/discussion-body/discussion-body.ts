import type { DiscussionBodyInput } from "../specs.type.js";

/**
 * The first message of a document's discussion post: its id, a short description, and the pull request that added it,
 * each in a paragraph of its own. The pull request's address is kept in angle brackets so the chat service does not
 * expand it into a preview card. A part that is not known (a document with no summary, one whose pull request cannot
 * be found) is left out, with its blank line.
 */
export function discussionBody({ id, summary, pr }: DiscussionBodyInput): string {
	const pull = pr ? `PR: [#${pr.number}](<${pr.url}>)` : "";
	return [id, summary, pull].filter(Boolean).join("\n\n");
}
