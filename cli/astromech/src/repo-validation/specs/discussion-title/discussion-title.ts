import type { SpecKind } from "../specs.type.js";

/** Discord, and most chat services, cap a thread title near this. */
const MAX_TITLE = 100;

/** The word that opens a discussion's title, so the kind is clear in a list without opening the post. */
const PREFIX: Record<SpecKind, string> = { spec: "SPEC: ", adr: "ADR: " };

/**
 * The title of a spec's or ADR's discussion post: `SPEC: <title>` or `ADR: <title>`, cut with an ellipsis so the whole
 * is at most 100 characters. The title is the document's own (see `specTitle`), already free of markup.
 */
export function discussionTitle(kind: SpecKind, title: string): string {
	const full = `${PREFIX[kind]}${title}`;
	return full.length > MAX_TITLE ? `${full.slice(0, MAX_TITLE - 1)}…` : full;
}
