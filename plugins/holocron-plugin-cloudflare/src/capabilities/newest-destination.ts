import type { CfWebhookDestination } from "@theholocron/cloudflare-client";

/** The instant of an RFC 3339 time, so `+02:00` and `Z` spellings of times compare as the moments they are; `-Infinity` when absent or unreadable. */
function instant(createdAt: string | undefined): number {
	const time = createdAt === undefined ? Number.NaN : Date.parse(createdAt);
	return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * The destination to use among several that match: the one created last (by the instant of `created_at`, not the
 * text), else the last in list order (a destination with no usable date never beats one with a date; ties go to the
 * later one in the list).
 */
export function newestDestination(destinations: CfWebhookDestination[]): CfWebhookDestination | undefined {
	let best: CfWebhookDestination | undefined;
	for (const d of destinations) {
		if (!best || instant(d.created_at) >= instant(best.created_at)) best = d;
	}
	return best;
}
