export type SentinelEventType =
	| "installation.created"
	| "installation.deleted"
	| "push.default-branch"
	| "pull_request.opened"
	| "pull_request.synchronize"
	| "pull_request.edited"
	| "team.membership"
	| "organization.member-removed";

export interface SentinelEvent {
	type: SentinelEventType;
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

/** The part of an `organization` delivery Sentinel reads. */
export interface GitHubOrganizationWebhookPayload {
	/** What happened, e.g. `member_removed`. */
	action: string;
	/** The organisation. */
	organization: { login: string };
	/** The installation the delivery is about, when sent. */
	installation?: { id: number };
}
