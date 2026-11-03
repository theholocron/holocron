import type { NotificationsLayout } from "../../../plugin/index.js";
import { avatarProblem } from "../avatar-problem.js";

/** The first reason a picture in the layout (`webhookAvatar`, a channel's `webhook.avatar`) cannot work, or undefined. */
export function layoutPictureProblem(layout: NotificationsLayout): string | undefined {
	const general = avatarProblem(undefined, "webhookAvatar", layout.webhookAvatar);
	if (general) return general;
	for (const channel of (layout.categories ?? []).flatMap((c) => c.channels ?? [])) {
		const own = typeof channel.webhook === "object" && channel.webhook ? channel.webhook.avatar : undefined;
		const problem = avatarProblem(channel.name, "webhook.avatar", own);
		if (problem) return problem;
	}
	return undefined;
}
