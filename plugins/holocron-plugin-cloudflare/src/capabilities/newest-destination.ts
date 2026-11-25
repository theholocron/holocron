import type { CfWebhookDestination } from "@theholocron/cloudflare-client";

/**
 * The destination to use among several that match: the one with the latest `created_at`, else the last in list
 * order (a destination with no date never beats one with a date; ties go to the later one in the list).
 */
export function newestDestination(destinations: CfWebhookDestination[]): CfWebhookDestination | undefined {
	let best: CfWebhookDestination | undefined;
	for (const d of destinations) {
		if (!best) best = d;
		else if (!best.created_at || (d.created_at ?? "") >= best.created_at) best = d;
	}
	return best;
}
