/** A picture as the layout may write it: a path or URL, or `{ url, image }`. */
export type FeedPicture = string | { url?: string; image?: string } | undefined;

/**
 * The first reason a picture cannot work, or undefined. `key` names it for the message (`feeds.errors.avatar`,
 * `webhookAvatar`); `channel` is the channel it belongs to, left out for a setting of the layout itself. A `null` a config
 * wrote is refused, not read as absent.
 */
export function avatarProblem(
	channel: string | undefined,
	key: string,
	picture: FeedPicture | null
): string | undefined {
	if (typeof picture !== "object") return undefined;
	const where = `${channel === undefined ? "" : `channel \`${channel}\`: `}\`${key}`;
	if (picture === null) return `${where}\` must be a path or an https:// URL, or \`{ url, image }\``;
	if (!picture.url && !picture.image) {
		return `${where}\` needs a \`url\`, an \`image\`, or both`;
	}
	if (picture.url && !/^https:\/\//i.test(picture.url)) {
		return `${where}.url\` must be an https:// URL`;
	}
	// The fallback is a file in the repo: any `scheme:` form (https:, http:, data:, file:) is refused. Two or more letters,
	// so a Windows drive path such as `C:\media\a.png` is still a path.
	if (picture.image && /^[a-z][a-z0-9+.-]+:/i.test(picture.image)) {
		return `${where}.image\` must be a file in the repo, not a URL`;
	}
	return undefined;
}
