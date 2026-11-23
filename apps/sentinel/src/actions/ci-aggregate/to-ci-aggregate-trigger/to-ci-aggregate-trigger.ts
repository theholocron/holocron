import type { SentinelEvent } from "../../../utils/webhook/index.js";
import type { CiAggregateTrigger } from "../ci-aggregate.type.js";

/** The `pull_request` actions that make the aggregate exist (or exist again) for a head commit. */
const FEED_ACTIONS: ReadonlySet<string> = new Set(["reopened", "ready_for_review"]);

/**
 * What the `ci` aggregate should do for a webhook event, or `undefined` when the event is not one it reads (SPEC-0099):
 * a pull request opened, pushed to, reopened or made ready (post the check at once, then compute), a finished check run,
 * a Re-run on the aggregate, and a commit status. A delivery a bot caused is not dropped: Dependabot's pull requests need
 * the required check as much as anyone's.
 */
export function toCiAggregateTrigger(event: SentinelEvent): CiAggregateTrigger | undefined {
	const pullRequests = event.pullRequests ?? [];
	const base = { pullRequests, branches: event.branches ?? [] };
	switch (event.type) {
		case "pull_request.opened":
		case "pull_request.synchronize":
			return pullRequests.length === 0 ? undefined : { kind: "pull_request", ...withSha(event), ...base };
		case "pull_request.feed":
			return pullRequests.length > 0 && event.action !== undefined && FEED_ACTIONS.has(event.action)
				? { kind: "pull_request", ...withSha(event), ...base }
				: undefined;
		case "check_run.leaf":
			return { kind: "check_run", ...withSha(event), ...withName(event), ...base };
		case "check_run.rerequested":
			return { kind: "rerequested", ...withSha(event), ...withName(event), ...base };
		case "status":
			return { kind: "status", ...withSha(event), ...withName(event), ...base };
		default:
			return undefined;
	}
}

const withSha = (event: SentinelEvent) => (event.headSha === undefined ? {} : { sha: event.headSha });
const withName = (event: SentinelEvent) => (event.checkName === undefined ? {} : { name: event.checkName });
