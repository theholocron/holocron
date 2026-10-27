/** A feed's picture as the layout may write it: a path or URL, or `{ url, image }`. */
export type FeedPicture = string | { url?: string; image?: string } | undefined;

/** The first reason a feed's `avatar` cannot work, or undefined. `feed` names the key for the message (`monitoring`, `errors`). */
export function avatarProblem(channel: string, feed: string, picture: FeedPicture): string | undefined {
	if (typeof picture !== "object") return undefined;
	if (!picture.url && !picture.image) {
		return `channel \`${channel}\`: \`feeds.${feed}.avatar\` needs a \`url\`, an \`image\`, or both`;
	}
	if (picture.url && !/^https:\/\//i.test(picture.url)) {
		return `channel \`${channel}\`: \`feeds.${feed}.avatar.url\` must be an https:// URL`;
	}
	if (picture.image && /^https?:\/\//i.test(picture.image)) {
		return `channel \`${channel}\`: \`feeds.${feed}.avatar.image\` must be a file in the repo, not a URL`;
	}
	return undefined;
}
