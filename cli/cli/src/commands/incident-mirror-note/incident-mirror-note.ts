import type { Notifications } from "../../plugin/index.js";

/**
 * A note when an incident on `pageName` will not reach a forum: `sync incidents` mirrors the one page `feeds.incidents`
 * names (or the only one declared, with `true`), so an incident on another page, or with no such forum, stays on the
 * status page. Undefined when it is mirrored.
 */
export function incidentMirrorNote(
	notifications: readonly Notifications[],
	pageName: string,
	pageCount: number
): string | undefined {
	const feeds = notifications
		.flatMap((n) => n.layout?.categories ?? [])
		.flatMap((c) => c.channels ?? [])
		.map((c) => c.feeds?.incidents)
		.filter((f) => f !== undefined && f !== false);
	if (feeds.length === 0) return "no forum has `feeds.incidents`, so this incident will not be mirrored to Discord";
	if (feeds.length > 1) {
		return "several forums have `feeds.incidents`, so `sync incidents` refuses to run and this incident will not be mirrored to Discord";
	}
	const named = feeds.filter((f): f is string => typeof f === "string");
	const mirrored = feeds.includes(true) ? pageCount === 1 : named.includes(pageName);
	if (mirrored) return undefined;
	return `\`sync incidents\` follows ${named.map((n) => `"${n}"`).join(", ") || "one page only"}, so this incident will not be mirrored to Discord`;
}
