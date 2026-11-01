export type SentinelEventType =
	| "installation.created"
	| "installation.deleted"
	| "push.default-branch"
	| "pull_request.opened"
	| "pull_request.synchronize"
	| "pull_request.edited";

export interface SentinelEvent {
	type: SentinelEventType;
	/** `"owner/repo"` — absent for installation events, which aren't scoped to one repo. */
	repo?: string;
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
