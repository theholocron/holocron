import type { SentinelCheckRun } from "../../utils/webhook/index.js";

/** What a delivery asks of the feed, normalized from the webhook event. */
export type PrFeedTrigger =
	/** A `pull_request` action. */
	| { kind: "pull_request"; action: string; numbers: number[] }
	/** A review was submitted or dismissed. */
	| { kind: "review"; numbers: number[] }
	/** A check run completed; the pull requests are the ones its commit is in. */
	| { kind: "check_run"; numbers: number[]; check: SentinelCheckRun };

/** The state of a post in the #prs forum, shown as its tag. */
export type PullRequestTag =
	"draft" | "conflicts" | "failing" | "changes requested" | "ready" | "waiting" | "merged" | "closed";

/** A pull request as the feed sees it now, fetched by the caller and never taken from the event that arrived. */
export interface PullRequestState {
	/** `owner/repo`. */
	repo: string;
	number: number;
	title: string;
	url: string;
	author: string;
	authorIsBot: boolean;
	draft: boolean;
	merged: boolean;
	closed: boolean;
	/** ISO timestamp. */
	createdAt: string;
	base: string;
	requestedReviewers: string[];
	review: "approved" | "changes_requested" | "review_required" | "none";
	/** The `ci / Required checks` result for the head commit. */
	ci: "passing" | "failing" | "pending" | "none";
	mergeable: "clean" | "conflicting" | "unknown";
}

/** What the renderer gives back: the post title, the first message (no footer) and the tag. */
export interface RenderedPullRequest {
	title: string;
	body: string;
	tag: PullRequestTag;
}

/** The `ci / Required checks` verdict for one head commit. */
export interface CiVerdict {
	repo: string;
	sha: string;
	conclusion: "success" | "failure" | "timed_out" | "cancelled";
	runUrl: string;
	/** The aggregate's own summary, which lists every expected check. */
	summaryUrl?: string;
	/** The checks that did not succeed. */
	failed: { name: string; url: string }[];
}
