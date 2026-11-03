import type { NotificationsLayout, NotificationsPicture } from "../../../plugin/index.js";
import { pictureSources } from "../picture-sources/index.js";

/**
 * The pictures a channel's webhook may wear, in order of preference: its own `avatar`, else the layout's `webhookAvatar`,
 * else none. Either may be a single source or `{ url, image }`, the URL first and the file in the repo as its fallback.
 */
export function webhookAvatarOf(
	layout: NotificationsLayout,
	webhook: boolean | { avatar?: NotificationsPicture | null } | null | undefined
): string[] {
	const own = typeof webhook === "object" && webhook ? webhook.avatar : undefined;
	return pictureSources(own ?? layout.webhookAvatar);
}
