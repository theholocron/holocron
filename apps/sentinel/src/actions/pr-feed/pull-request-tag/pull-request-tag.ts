import type { PullRequestState, PullRequestTag } from "../pr-feed.type.js";

/** The tag of a pull request: the first that applies of merged, closed, draft, conflicts, failing, changes requested, ready, waiting. */
export function pullRequestTag(state: PullRequestState): PullRequestTag {
	if (state.merged) return "merged";
	if (state.closed) return "closed";
	if (state.draft) return "draft";
	if (state.mergeable === "conflicting") return "conflicts";
	if (state.ci === "failing") return "failing";
	if (state.review === "changes_requested") return "changes requested";
	if (state.review === "approved" && state.ci === "passing") return "ready";
	return "waiting";
}
