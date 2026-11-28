import type { NotificationsLayout, NotificationsReaction } from "../../../plugin/index.js";

/**
 * Every reaction a layout writes that can name a server emoji: each forum's default and starter reactions and its tags'
 * `emoji` (a tag's is a string, Unicode or `:name:`), then the layout's own `emojis` (server emoji made with no reaction
 * naming them), in that order.
 */
export function layoutReactions(layout: NotificationsLayout | undefined): NotificationsReaction[] {
	const reactions: NotificationsReaction[] = [];
	for (const channel of (layout?.categories ?? []).flatMap((c) => c.channels ?? [])) {
		if (channel.defaultReaction !== undefined) reactions.push(channel.defaultReaction);
		reactions.push(...(channel.starterReactions ?? []));
		for (const tag of channel.tags ?? []) if (tag.emoji) reactions.push(tag.emoji);
	}
	reactions.push(...(layout?.emojis ?? []));
	return reactions;
}
