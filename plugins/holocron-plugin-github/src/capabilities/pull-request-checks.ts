import type { PullRequestChecks, PullRequestChecksState } from "@theholocron/cli";
import type { GitHubCheckRun, GitHubClient } from "@theholocron/github-client";

/** The check run the aggregate `ci` workflow posts on a pull request's head commit. */
const AGGREGATE_CHECK = "ci / Required checks";

const FAILED = new Set(["failure", "timed_out", "startup_failure", "action_required", "stale"]);

const newestFirst = (a: GitHubCheckRun, b: GitHubCheckRun) =>
	(b.started_at ?? "").localeCompare(a.started_at ?? "") || b.id - a.id;

/** The aggregate's verdict from its runs: only the newest counts; a cancelled or unfinished run is `pending`. */
function aggregateState(runs: readonly GitHubCheckRun[]): PullRequestChecksState {
	const newest = [...runs].sort(newestFirst)[0];
	if (!newest) return "none";
	if (newest.status !== "completed") return "pending";
	if (newest.conclusion === "success") return "success";
	if (newest.conclusion && FAILED.has(newest.conclusion)) return "failure";
	if (newest.conclusion === "cancelled") return "pending";
	return "none";
}

/**
 * The aggregate check of a pull request's newest commit and the checks that failed on it, read now (never cached, so a
 * caller that polls sees each change). The newest run of each name counts, so a job that failed and was re-run to green
 * is not listed.
 */
export async function readPullRequestChecks(
	client: GitHubClient,
	repo: string,
	number: number
): Promise<PullRequestChecks> {
	const pr = await client.pulls.getPullRequest(repo, number);
	const sha = pr.head.sha;
	const runs = await client.checks.listCheckRunsForRef(repo, sha);
	const newest = new Map<string, GitHubCheckRun>();
	for (const run of [...runs].sort(newestFirst)) if (!newest.has(run.name)) newest.set(run.name, run);
	const state = aggregateState(runs.filter((r) => r.name === AGGREGATE_CHECK));
	const failing = [...newest.values()]
		.filter((r) => r.status === "completed" && r.conclusion !== null && FAILED.has(r.conclusion))
		.map((r) => ({ name: r.name, url: r.details_url ?? r.html_url }));
	return { state, sha, failing };
}
