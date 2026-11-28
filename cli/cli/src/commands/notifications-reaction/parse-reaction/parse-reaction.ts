import type { NotificationsReaction } from "../../../plugin/index.js";
import type { ParsedReaction } from "./parse-reaction.type.js";

/** A server emoji written as Discord shows it: `:name:`, the name 2 to 32 letters, digits and underscores. */
export const CUSTOM_EMOJI = /^:([A-Za-z0-9_]{2,32}):$/;

/**
 * Reads a layout reaction. `":git_merge:"` (or `{ emoji: ":git_merge:", image }`) is a server emoji named `git_merge`;
 * any other string is a Unicode emoji and kept as written. It does not judge a value: `reactionProblem()` does, before
 * anything is applied, so an invalid `emoji` here is kept as the name it was given.
 */
export function parseReaction(reaction: NotificationsReaction): ParsedReaction {
	if (typeof reaction === "string") {
		const name = CUSTOM_EMOJI.exec(reaction)?.[1];
		return name === undefined ? { kind: "unicode", value: reaction } : { kind: "custom", name };
	}
	const name = CUSTOM_EMOJI.exec(reaction.emoji)?.[1] ?? reaction.emoji;
	return { kind: "custom", name, ...(reaction.image ? { image: reaction.image } : {}) };
}
