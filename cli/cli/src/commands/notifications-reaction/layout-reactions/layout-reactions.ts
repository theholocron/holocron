import type { NotificationsLayout, NotificationsReaction } from "../../../plugin/index.js";

/**
 * Every reaction a layout writes that can name a server emoji: each forum's default and starter reactions, then the
 * layout's own `emojis` (server emoji made with no reaction naming them), in that order.
 */
export function layoutReactions(layout: NotificationsLayout | undefined): NotificationsReaction[] {
	const reactions: NotificationsReaction[] = [];
	for (const channel of (layout?.categories ?? []).flatMap((c) => c.channels ?? [])) {
		if (channel.defaultReaction !== undefined) reactions.push(channel.defaultReaction);
		reactions.push(...(channel.starterReactions ?? []));
	}
	reactions.push(...(layout?.emojis ?? []));
	return reactions;
}
