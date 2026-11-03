import { discussionIdLine } from "../discussion-id-line/index.js";
import { discussionPrLine } from "../discussion-pr-line/index.js";
import type { DiscussionBodyInput } from "../specs.type.js";

/**
 * The first message of a document's discussion post: its id (a link to the file once it is on the default branch, see
 * {@link discussionIdLine}), a short description, and the pull request that added it,
 * each in a paragraph of its own. The pull request's address is kept in angle brackets so the chat service does not
 * expand it into a preview card. A part that is not known (a document with no summary, one whose pull request cannot
 * be found) is left out, with its blank line.
 */
export function discussionBody({ id, summary, pr, file }: DiscussionBodyInput): string {
	const pull = discussionPrLine(pr);
	return [discussionIdLine(id, file), summary, pull].filter(Boolean).join("\n\n");
}
