import type { SpecKind } from "../specs.type.js";

/** Discord, and most chat services, cap a thread title near this. */
const MAX_TITLE = 100;

/** What opens a discussion's title, so the kind is clear in a list without opening the post. */
const PREFIX: Record<SpecKind, string> = { spec: "💡 New spec: ", adr: "📐 New ADR: " };

/**
 * The title of a spec's or ADR's discussion post: `💡 New spec: <title>` or `📐 New ADR: <title>`, in plain text (a title cannot be formatted), cut with an ellipsis so the whole
 * is at most 100 characters. The title is the document's own (see `specTitle`), already free of markup.
 */
export function discussionTitle(kind: SpecKind, title: string): string {
	const full = `${PREFIX[kind]}${title}`;
	return full.length > MAX_TITLE ? `${full.slice(0, MAX_TITLE - 1)}…` : full;
}
