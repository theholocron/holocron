import type { SentinelEvent } from "../../../utils/webhook/index.js";
import type { AreaLabelsTrigger } from "../area-labels.type.js";

/**
 * What the area labels should do for a webhook event, or `undefined` when the event is not one they read (spec
 * `tech-github-area-labels`): a pull request opened, reopened or pushed to, or whose title was edited (a description
 * edit changes no area), and an issue opened or whose title was edited. A delivery a bot caused does nothing.
 */
export function toAreaLabelsTrigger(event: SentinelEvent): AreaLabelsTrigger | undefined {
	const sender = event.raw.sender as { type?: string } | undefined;
	if (sender?.type === "Bot") return undefined;
	switch (event.type) {
		case "issues.area":
			return event.issueNumber === undefined ? undefined : { kind: "issue", number: event.issueNumber };
		case "pull_request.opened":
		case "pull_request.synchronize":
			return pullRequest(event);
		case "pull_request.edited": {
			const changes = event.raw.changes as { title?: unknown } | undefined;
			return changes?.title === undefined ? undefined : pullRequest(event);
		}
		case "pull_request.feed":
			return event.action === "reopened" ? pullRequest(event) : undefined;
		default:
			return undefined;
	}
}

function pullRequest(event: SentinelEvent): AreaLabelsTrigger | undefined {
	const [number] = event.pullNumbers ?? [];
	return number === undefined ? undefined : { kind: "pull_request", number };
}
