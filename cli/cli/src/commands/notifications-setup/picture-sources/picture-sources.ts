import type { NotificationsPicture } from "../../../plugin/index.js";

/**
 * The sources a picture names, in the order to try them: a single path or URL, or the `url` and then the `image`.
 * An absent picture (or a `null` a config wrote) names none.
 */
export function pictureSources(picture: NotificationsPicture | null | undefined): string[] {
	if (!picture) return [];
	if (typeof picture === "string") return [picture];
	return [picture.url, picture.image].filter((source): source is string => Boolean(source));
}
