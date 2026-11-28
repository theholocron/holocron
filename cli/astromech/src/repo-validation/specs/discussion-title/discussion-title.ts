/** Discord, and most chat services, cap a thread title near this. */
const MAX_TITLE = 100;

/**
 * The title of a spec's or ADR's discussion post: the document's own title, in plain text (a title cannot be formatted),
 * cut with an ellipsis so it is at most 100 characters. The title is the document's own (see `specTitle`), already free
 * of markup. Nothing is put in front of it: the status tag says where the document stands and the id is in the first message.
 */
export function discussionTitle(title: string): string {
	return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;
}
