import type { NotificationsReaction } from "../../../plugin/index.js";
import { parseReaction } from "../parse-reaction/index.js";

/** How a reaction is written in a layout and shown in a row: `:name:` for a server emoji, the character otherwise. */
export function reactionSpelling(reaction: NotificationsReaction): string {
	const parsed = parseReaction(reaction);
	return parsed.kind === "custom" ? `:${parsed.name}:` : parsed.value;
}
