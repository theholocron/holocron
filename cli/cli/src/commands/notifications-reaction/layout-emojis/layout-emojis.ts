import type { NotificationsLayout } from "../../../plugin/index.js";
import { parseReaction } from "../parse-reaction/index.js";
import type { LayoutEmoji } from "./layout-emojis.type.js";

/**
 * The server emoji a layout's forum reactions name (default and starter), once each, in the order the layout first
 * names them. A name that is given an `image` anywhere keeps it, so the picture can sit on any one of its uses.
 */
export function layoutEmojis(layout: NotificationsLayout | undefined): LayoutEmoji[] {
	const found = new Map<string, LayoutEmoji>();
	for (const channel of (layout?.categories ?? []).flatMap((c) => c.channels ?? [])) {
		const reactions = [
			...(channel.defaultReaction === undefined ? [] : [channel.defaultReaction]),
			...(channel.starterReactions ?? []),
		];
		for (const reaction of reactions) {
			const parsed = parseReaction(reaction);
			if (parsed.kind !== "custom") continue;
			const have = found.get(parsed.name);
			if (!have) found.set(parsed.name, { name: parsed.name, ...(parsed.image ? { image: parsed.image } : {}) });
			else if (!have.image && parsed.image) have.image = parsed.image;
		}
	}
	return [...found.values()];
}
