import type { BoardPullRequest, BoardPullRequestChecks } from "@theholocron/cli";
import type { GraphQLClient } from "@theholocron/github-client";

/** The check run the aggregate `ci` workflow posts on a pull request's head commit. */
export const AGGREGATE_CHECK = "ci / Required checks";

/**
 * One issue's closing pull requests and the aggregate check on each one's newest commit. It is its own small query,
 * never part of the board's items query: nested under `items(first: 100)` it multiplies past GitHub's resource limit.
 */
export const CLOSING_QUERY = `query($id: ID!) { node(id: $id) { ... on Issue {
	closedByPullRequestsReferences(first: 5, includeClosedPrs: true) { nodes {
		number state isDraft repository { nameWithOwner }
		commits(last: 1) { nodes { commit { checkSuites(first: 30) { nodes {
			checkRuns(first: 5, filterBy: { checkName: "${AGGREGATE_CHECK}" }) { nodes { databaseId status conclusion startedAt } }
		} } } } }
	} }
} } }`;

/** How many issues are read at once: the provider's other fan-outs are as small. */
export const CLOSING_CONCURRENCY = 4;

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

/** What reading one issue's pull requests gave: the pull requests, or the reason they could not be read. */
export type ClosingResult = { pullRequests: BoardPullRequest[] } | { problem: string };

interface ClosingData {
	node: { closedByPullRequestsReferences?: { nodes: RawClosingPullRequest[] } } | null;
}

/**
 * Reads the closing pull requests of each issue (by node id) with one small query per issue, a few at a time. A query
 * that fails is that issue's `problem` and nothing else: the others are read, and the caller leaves the failed one's
 * pull-request rules unapplied.
 */
export async function readClosingPullRequests(
	graphql: GraphQLClient,
	contentIds: readonly string[],
	keyOf: (repo: string, number: number) => string
): Promise<Map<string, ClosingResult>> {
	const results = new Map<string, ClosingResult>();
	let next = 0;
	const worker = async () => {
		for (let i = next++; i < contentIds.length; i = next++) {
			const id = contentIds[i];
			try {
				const data = await graphql.query<ClosingData>(CLOSING_QUERY, { id });
				const nodes = data.node?.closedByPullRequestsReferences?.nodes;
				results.set(
					id,
					nodes
						? { pullRequests: toBoardPullRequests(nodes, keyOf) }
						: { problem: "GitHub returned no pull request list" }
				);
			} catch (err) {
				results.set(id, { problem: err instanceof Error ? err.message : String(err) });
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(CLOSING_CONCURRENCY, contentIds.length) }, worker));
	return results;
}
