import type { BoardPullRequest, BoardPullRequestChecks } from "@theholocron/cli";

/** The check run the aggregate `ci` workflow posts on a pull request's head commit. */
export const AGGREGATE_CHECK = "ci / Required checks";

/** The GraphQL selection that reads an issue's closing pull requests and the aggregate check on each head commit. */
export const CLOSING_PULL_REQUESTS = `closedByPullRequestsReferences(first: 5, includeClosedPrs: true) { nodes {
	number state isDraft repository { nameWithOwner }
	commits(last: 1) { nodes { commit { checkSuites(first: 50) { nodes {
		checkRuns(first: 5, filterBy: { checkName: "${AGGREGATE_CHECK}" }) { nodes { databaseId status conclusion startedAt } }
	} } } } }
} }`;

/** One check run as GraphQL returns it. */
export interface RawCheckRun {
	databaseId: number;
	status: string;
	conclusion: string | null;
	startedAt: string | null;
}

/** One closing pull request as GraphQL returns it. */
export interface RawClosingPullRequest {
	number: number;
	state: string;
	isDraft: boolean;
	repository: { nameWithOwner: string };
	commits?: {
		nodes: Array<{ commit: { checkSuites: { nodes: Array<{ checkRuns: { nodes: RawCheckRun[] } }> } } }>;
	};
}

const FAILED = new Set(["FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED", "STALE"]);

/**
 * The state of the aggregate check from the runs of that name on one commit. Only the newest run counts (latest
 * `startedAt`, then id), so a cancelled first batch or a re-run that went green does not hold the verdict red. A run
 * that is not finished, or that was cancelled, is `pending`; one with no verdict (neutral, skipped) or none posted is `none`.
 */
export function aggregateChecks(runs: readonly RawCheckRun[]): BoardPullRequestChecks {
	const newest = [...runs].sort(
		(a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? "") || b.databaseId - a.databaseId
	)[0];
	if (!newest) return "none";
	if (newest.status !== "COMPLETED") return "pending";
	if (newest.conclusion === "SUCCESS") return "success";
	if (newest.conclusion && FAILED.has(newest.conclusion)) return "failure";
	if (newest.conclusion === "CANCELLED") return "pending";
	return "none";
}

/** The neutral pull requests an issue is closed by; only an open one has its checks read, the others are `none`. */
export function toBoardPullRequests(
	nodes: readonly RawClosingPullRequest[],
	keyOf: (repo: string, number: number) => string
): BoardPullRequest[] {
	return nodes.map((pr) => {
		const state = pr.state === "OPEN" ? "open" : pr.state === "MERGED" ? "merged" : "closed";
		const runs = (pr.commits?.nodes ?? []).flatMap((c) =>
			c.commit.checkSuites.nodes.flatMap((suite) => suite.checkRuns.nodes)
		);
		return {
			key: keyOf(pr.repository.nameWithOwner, pr.number),
			state,
			draft: pr.isDraft,
			checks: state === "open" ? aggregateChecks(runs) : "none",
		};
	});
}
