import { posix } from "node:path";

import type { NotificationsReaction } from "../../../plugin/index.js";
import { CUSTOM_EMOJI } from "../parse-reaction/index.js";

/** The folder a layout's emoji pictures live in, as the webhook avatar's files do. */
export const EMOJI_MEDIA_DIR = ".holocron/media/";

/**
 * The first reason a reaction cannot work, or undefined; `noun` names it in the message (`` `defaultReaction` ``, "a
 * starter reaction"). A Unicode emoji must be a character, not a word (`git_merge` without colons would be sent to
 * Discord as text), a server emoji `:name:` with a name Discord allows, and an `image` a file under `.holocron/media/`
 * (a path, not a URL, with no `..` out of it). A `null` a config wrote is refused, not read as absent.
 */
export function reactionProblem(noun: string, reaction: NotificationsReaction | null): string | undefined {
	if (reaction === null || (typeof reaction !== "string" && typeof reaction !== "object")) {
		return `${noun} must be an emoji, \`:name:\` for a server emoji, or \`{ emoji, image }\``;
	}
	const text = typeof reaction === "string" ? reaction : reaction.emoji;
	if (typeof text !== "string" || text.trim() === "") return `${noun} is empty`;
	const isCustom = CUSTOM_EMOJI.test(text);
	if (typeof reaction === "object" && !isCustom) {
		return `${noun}: \`emoji\` must be a server emoji written \`:name:\` (2 to 32 letters, digits and underscores), not \`${text}\``;
	}
	if (!isCustom && /^:|:$|^[A-Za-z0-9_ ]+$/.test(text)) {
		return `${noun}: \`${text}\` is not an emoji; write a server emoji as \`:name:\` (2 to 32 letters, digits and underscores)`;
	}
	if (typeof reaction === "object" && reaction.image !== undefined) {
		const image = reaction.image;
		if (typeof image !== "string" || image.trim() === "") return `${noun}: \`image\` is empty`;
		if (/^[a-z][a-z0-9+.-]+:/i.test(image)) {
			return `${noun}: \`image\` must be a file under \`${EMOJI_MEDIA_DIR}\`, not a URL`;
		}
		const path = posix.normalize(image);
		if (!path.startsWith(EMOJI_MEDIA_DIR) || path === EMOJI_MEDIA_DIR) {
			return `${noun}: \`image\` must be a file under \`${EMOJI_MEDIA_DIR}\`, not \`${image}\``;
		}
	}
	return undefined;
}
