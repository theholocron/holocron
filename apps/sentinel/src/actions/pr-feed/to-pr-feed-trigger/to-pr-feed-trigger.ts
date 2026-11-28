import type { SentinelEvent } from "../../../utils/webhook/index.js";
import type { PrFeedTrigger } from "../pr-feed.type.js";

/**
 * What the #prs feed should do for a webhook event, or `undefined` when the event is not one the feed reads (an
 * installation, a push, a membership change) or does not say which pull request it is about.
 */
export function toPrFeedTrigger(event: SentinelEvent): PrFeedTrigger | undefined {
	const numbers = event.pullNumbers;
	if (!numbers) return undefined;
	switch (event.type) {
		case "pull_request.opened":
		case "pull_request.synchronize":
		case "pull_request.edited":
		case "pull_request.feed":
			return event.action === undefined ? undefined : { kind: "pull_request", action: event.action, numbers };
		case "pull_request_review":
			return { kind: "review", numbers };
		case "check_run.completed":
			return event.checkRun ? { kind: "check_run", numbers, check: event.checkRun } : undefined;
		default:
			return undefined;
	}
}
