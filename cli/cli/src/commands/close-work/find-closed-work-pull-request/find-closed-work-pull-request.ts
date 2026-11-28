import type { PullRequest } from "../../../plugin/index.js";
import { findWorkPullRequests } from "../../update-work/find-work-pull-request/index.js";

/**
 * The closed pull requests of a piece of work, merged ones first, found by the same branch rule as
 * {@link findWorkPullRequests} (`<type>/<issue>-<slug>`); the order within each group is the one given (newest first).
 */
export function findClosedWorkPullRequests(prs: readonly PullRequest[], issue: string): PullRequest[] {
	const closed = prs.filter((pr) => pr.state === "closed");
	// `findWorkPullRequests` looks at open ones only, so ask it as if they were, then hand back the originals.
	const found = new Set(
		findWorkPullRequests(
			closed.map((pr) => ({ ...pr, state: "open" as const })),
			issue
		).map((pr) => pr.number)
	);
	const matching = closed.filter((pr) => found.has(pr.number));
	return [...matching.filter((pr) => pr.merged), ...matching.filter((pr) => !pr.merged)];
}
