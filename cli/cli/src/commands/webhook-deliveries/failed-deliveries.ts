import type { GitHubAppDelivery } from "@theholocron/github-client";

/** Whether a delivery reached the App's endpoint and was answered with a success (2xx). */
const succeeded = (delivery: GitHubAppDelivery): boolean => delivery.statusCode >= 200 && delivery.statusCode < 300;

/**
 * The deliveries that still need delivering again, oldest first (SPEC-0099, recovery 2). A delivery and its
 * redeliveries share one GUID, so each GUID is judged by its **latest** attempt: a first attempt that failed and was
 * redelivered successfully is done, and one whose latest redelivery failed too is returned once, as that attempt, never
 * once per attempt. A delivery that got no answer at all (`statusCode` `0`) has failed.
 */
export function failedDeliveries(deliveries: readonly GitHubAppDelivery[]): GitHubAppDelivery[] {
	const latest = new Map<string, GitHubAppDelivery>();
	for (const delivery of deliveries) {
		const seen = latest.get(delivery.guid);
		if (seen === undefined || delivery.deliveredAt > seen.deliveredAt) latest.set(delivery.guid, delivery);
	}
	return [...latest.values()]
		.filter((delivery) => !succeeded(delivery))
		.sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt) || a.id - b.id);
}
