import type { DiscussionBodyInput } from "../specs.type.js";

/**
 * The line of a discussion post's first message that names the pull request that added the document:
 * `PR: [#1538](<address>)`. The address is kept in angle brackets so the chat service does not expand it into a preview
 * card. Empty when the pull request is not known, so a post names none. {@link discussionBody} writes it, and a repair of
 * existing posts compares against it.
 */
export function discussionPrLine(pr: DiscussionBodyInput["pr"]): string {
	return pr ? `PR: [#${pr.number}](<${pr.url}>)` : "";
}
