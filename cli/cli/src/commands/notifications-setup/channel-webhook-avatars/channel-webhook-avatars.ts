import type { NotificationsChannelLayout, NotificationsLayout } from "../../../plugin/index.js";
import { webhookAvatarOf } from "../webhook-avatar-of/index.js";

/** The pictures a channel's own webhook may wear, in order (none when the channel has no webhook). */
export function channelWebhookAvatars(layout: NotificationsLayout, channel: NotificationsChannelLayout): string[] {
	return channel.webhook ? webhookAvatarOf(layout, channel.webhook) : [];
}
