export type SentinelEventType =
	| "installation.created"
	| "installation.deleted"
	| "push.default-branch"
	| "pull_request.opened"
	| "pull_request.synchronize"
	| "pull_request.edited"
	/** A `pull_request` action only the #prs feed reads (reopened, closed, ready_for_review, labeled, …, or an edit of neither title nor description). No other check runs for it. */
	| "pull_request.feed"
	/** A `pull_request_review` `submitted` or `dismissed`; only the #prs feed reads it. */
	| "pull_request_review"
	/** A completed `ci / Required checks` check run; only the #prs feed reads it. */
	| "check_run.completed"
	| "team.membership"
	| "organization.member-removed";

/** The part of a completed `check_run` the #prs feed needs. */
export interface SentinelCheckRun {
	name: string;
	/** The commit the check ran on. */
	headSha: string;
	/** `success`, `failure`, … as GitHub sends it; `null` is not expected for a completed run. */
	conclusion: string | null;
	/** The check run's page, which shows its summary. */
	url: string;
	/** The run's own "Details" link, when it set one. */
	detailsUrl?: string;
}

export interface SentinelEvent {
	type: SentinelEventType;
	/** The `action` of a `pull_request`, `pull_request_review` or `check_run` delivery. */
	action?: string;
	/** The pull requests a `pull_request*` delivery is about (one) or a `check_run` belongs to (none for a fork's). Set only when the payload names them. */
	pullNumbers?: number[];
	/** Set for `check_run.completed` only. */
	checkRun?: SentinelCheckRun;
	/** `"owner/repo"` — absent for installation events, which aren't scoped to one repo. */
	repo?: string;
	/** The organisation the delivery is about: set for the two org-level events (`team.membership`, `organization.member-removed`) only. */
	org?: string;
	/** The team's slug: set for `team.membership` only. */
	team?: string;
	installationId: number;
	/** `X-GitHub-Delivery` — GitHub's per-delivery id, useful for idempotency/logging. */
	deliveryId?: string;
	/** The full parsed payload, for handlers that need fields beyond the normalized ones. */
	raw: Record<string, unknown>;
}

export type ParseWebhookResult =
	{ handled: true; event: SentinelEvent } | { handled: false; reason: string; githubEvent: string };

export interface ParseWebhookEventInput {
	/** Raw request body (string or Buffer) — must be the exact bytes GitHub signed, pre-JSON-parse. */
	body: string | Buffer;
	/** Incoming HTTP headers — needed for `x-github-event` / `x-hub-signature-256` / `x-github-delivery`. */
	headers: Record<string, string | string[] | undefined>;
	/** This App's configured webhook secret. */
	secret: string;
}

/** The part of a `membership` delivery Sentinel reads: who changed on which team. */
export interface GitHubMembershipWebhookPayload {
	/** `added` or `removed` (a person joined or left the team). */
	action: string;
	/** What the membership is of; only `team` is handled. */
	scope: string;
	/** The team. */
	team: { slug: string };
	/** The organisation the team is in. */
	organization: { login: string };
	/** The installation the delivery is about, when sent. */
	installation?: { id: number };
}

/** The part of a `pull_request` delivery the feed reads beyond the client's payload type: which pull request. */
export interface GitHubPullRequestNumberPayload {
	number?: number;
	pull_request?: { number?: number };
}

/** The part of a `pull_request_review` delivery Sentinel reads. */
export interface GitHubPullRequestReviewWebhookPayload {
	/** `submitted`, `edited` or `dismissed`. */
	action: string;
	pull_request: { number: number };
	repository: { full_name: string };
	installation?: { id: number };
}

/** The part of a `check_run` delivery Sentinel reads. */
export interface GitHubCheckRunWebhookPayload {
	/** `created`, `completed`, `rerequested` or `requested_action`. */
	action: string;
	check_run: {
		name: string;
		head_sha: string;
		conclusion: string | null;
		html_url: string;
		details_url?: string | null;
		/** The pull requests the run's commit is in; empty for a fork's. */
		pull_requests: Array<{ number: number }>;
	};
	repository: { full_name: string };
	installation?: { id: number };
}

/** The part of an `organization` delivery Sentinel reads. */
export interface GitHubOrganizationWebhookPayload {
	/** What happened, e.g. `member_removed`. */
	action: string;
	/** The organisation. */
	organization: { login: string };
	/** The installation the delivery is about, when sent. */
	installation?: { id: number };
}
