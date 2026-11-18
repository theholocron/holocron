import { posix } from "node:path";

import type { NotificationsLayout } from "../../../plugin/index.js";
import { parseReaction } from "../parse-reaction/index.js";

/**
 * The first server emoji a layout gives two different pictures, or undefined. One name is one emoji, so it can be made
 * from one file only; the same file written twice is fine.
 */
export function emojiConflictProblem(layout: NotificationsLayout): string | undefined {
	const images = new Map<string, string>();
	for (const channel of (layout.categories ?? []).flatMap((c) => c.channels ?? [])) {
		const reactions = [
			...(channel.defaultReaction === undefined ? [] : [channel.defaultReaction]),
			...(channel.starterReactions ?? []),
		];
		for (const reaction of reactions) {
			const parsed = parseReaction(reaction);
			if (parsed.kind !== "custom" || !parsed.image) continue;
			const image = posix.normalize(parsed.image);
			const have = images.get(parsed.name);
			if (have !== undefined && have !== image) {
				return `emoji \`:${parsed.name}:\` is given two different images, \`${have}\` and \`${image}\``;
			}
			images.set(parsed.name, image);
		}
	}
	return undefined;
}
