import type { NotificationsLayout } from "@theholocron/cli";

import type { PermissionName } from "./rest.js";

/** What the bot needs in the server to do everything `setup` does. The invite link asks for exactly these. */
export const BOT_NEEDS: readonly PermissionName[] = [
	"ViewChannel",
	"SendMessages",
	"ReadMessageHistory",
	"ManageChannels",
	"ManageRoles",
	"ManageWebhooks",
	"ManageGuild",
	"CreatePublicThreads",
	"CreatePrivateThreads",
	"SendMessagesInThreads",
];

/**
 * What the bot keeps for a layout: the usual set, Pin Messages when the layout pins messages, Manage Threads when it
 * declares a forum (a post's tags are applied by the bot, and a moderated tag only by someone who can manage threads),
 * and Add Reactions when a forum has `starterReactions` (without it the bot skips them and the post still gets made).
 * The one list `setup`'s invite link, `doctor notifications` and `probe discord token` all read.
 */
export function botNeeds(layout: NotificationsLayout | undefined): PermissionName[] {
	const channels = (layout?.categories ?? []).flatMap((c) => c.channels ?? []);
	const forum = channels.some((ch) => ch.kind === "forum");
	const reacts = channels.some((ch) => (ch.starterReactions ?? []).length > 0);
	return [
		...BOT_NEEDS,
		...(layout?.pinned?.length ? (["PinMessages"] as PermissionName[]) : []),
		...(forum ? (["ManageThreads"] as PermissionName[]) : []),
		...(reacts ? (["AddReactions"] as PermissionName[]) : []),
	];
}
