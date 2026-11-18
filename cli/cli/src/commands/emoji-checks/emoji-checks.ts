import { sanitizeDetail } from "@theholocron/kyber/ui";

import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import { layoutEmojis } from "../notifications-reaction/index.js";
import type { EmojiChecksInput } from "./emoji-checks.type.js";

const TITLE = "server emoji the forums' reactions name exist";

/**
 * The step of `doctor notifications` for server emoji: each one a forum's `defaultReaction` or `starterReactions` names
 * (`:git_merge:`) is on the server. A missing one fails by name, and says how to get it: `setup` makes it when the layout
 * gives it an `image`, otherwise it has to be added in the server's settings (or the reaction changed). A changed default
 * reaction is the `channels` step's. Read-only. No row when no reaction names a server emoji; a skip when the server or
 * its emoji could not be read.
 */
export function emojiChecks(input: EmojiChecksInput): NotificationsCheck[] {
	const wanted = layoutEmojis(input.layout);
	if (wanted.length === 0) return [];
	const { found } = input;
	if (!found) return [skipRow("emoji", TITLE, "not checked: could not read the server")];
	if (found.emojisError) {
		return [
			skipRow(
				"emoji",
				TITLE,
				`not checked: could not read the server's emoji (${sanitizeDetail(found.emojisError)})`
			),
		];
	}
	const have = new Set(found.emojis ?? []);
	const problems = wanted
		.filter((emoji) => !have.has(emoji.name))
		.map((emoji) => {
			const name = sanitizeDetail(emoji.name);
			return emoji.image
				? `:${name}: is not on the server; \`setup notifications\` makes it from ${sanitizeDetail(emoji.image)}`
				: `:${name}: is not on the server; add it in the server's settings, or give the reaction an \`image\` for \`setup notifications\` to make it from`;
		});
	return [resultRow("emoji", TITLE, problems, `${wanted.length} of ${wanted.length} on the server`)];
}
