import type { GitHubPullRequestReview } from "@theholocron/github-client";

import { SENTINEL_PR_FEED_CHECK_NAME } from "../../../utils/constants/index.js";
import type { PullRequestState } from "../pr-feed.type.js";
import type { PullRequestSnapshot, ReadPullRequestStateInput } from "./read-pull-request-state.type.js";

const FAILED = new Set(["failure", "timed_out", "cancelled"]);

/** The reviews that count: each reviewer's last approval, change request or dismissal (a comment changes nothing). */
function review(reviews: GitHubPullRequestReview[], requested: string[]): PullRequestState["review"] {
	const latest = new Map<string, string>();
	for (const r of reviews) {
		if (r.user && (r.state === "APPROVED" || r.state === "CHANGES_REQUESTED" || r.state === "DISMISSED")) {
			latest.set(r.user.login, r.state);
		}
	}
	const states = [...latest.values()];
	if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
	if (states.includes("APPROVED")) return "approved";
	return requested.length > 0 ? "review_required" : "none";
}

/**
 * The pull request as it is now, from the GitHub API and never from the event that arrived: the pull request, its
 * reviews and the check runs of its head commit. The `ci / Required checks` result is the aggregate's latest run.
 */
export async function readPullRequestState(input: ReadPullRequestStateInput): Promise<PullRequestSnapshot> {
	const { client, repo, number, now } = input;
	const pull = await client.pulls.getPullRequest(repo, number);
	const [reviews, checkRuns] = await Promise.all([
		client.pulls.listReviews(repo, number),
		client.checks.listCheckRunsForRef(repo, pull.head.sha),
	]);

	const requestedReviewers = (pull.requested_reviewers ?? []).map((r) => r.login);
	const aggregate = checkRuns
		.filter((c) => c.name === SENTINEL_PR_FEED_CHECK_NAME)
		.reduce<(typeof checkRuns)[number] | undefined>((a, c) => (a && a.id > c.id ? a : c), undefined);
	const ci: PullRequestState["ci"] = !aggregate
		? "none"
		: aggregate.status !== "completed"
			? "pending"
			: aggregate.conclusion === "success"
				? "passing"
				: aggregate.conclusion && FAILED.has(aggregate.conclusion)
					? "failing"
					: "none";
	const mergeable: PullRequestState["mergeable"] =
		pull.mergeable_state === "dirty"
			? "conflicting"
			: pull.mergeable_state === undefined || pull.mergeable_state === "unknown"
				? "unknown"
				: "clean";

	return {
		state: {
			repo,
			number,
			title: pull.title,
			body: pull.body ?? "",
			url: pull.html_url,
			author: pull.user?.login ?? "unknown",
			authorIsBot: pull.user?.type === "Bot",
			draft: pull.draft ?? false,
			merged: pull.merged_at !== null,
			closed: pull.state === "closed",
			createdAt: pull.created_at ?? now.toISOString(),
			base: pull.base?.ref ?? "",
			requestedReviewers,
			review: review(reviews, requestedReviewers),
			ci,
			mergeable,
		},
		headSha: pull.head.sha,
		...(pull.merged_by ? { mergedBy: pull.merged_by.login } : {}),
		diff: {
			additions: pull.additions ?? 0,
			deletions: pull.deletions ?? 0,
			changedFiles: pull.changed_files ?? 0,
		},
		checkRuns,
	};
}
