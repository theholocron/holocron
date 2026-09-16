/**
 * Parses an inbound GitHub App webhook delivery and normalizes it into a
 * `SentinelEvent` — the shape the follow-up PR-stack items (custom-
 * properties sync call, check-run posting) will consume. Handler logic
 * only: no HTTP framework, no deploy target assumed — `parseWebhookEvent()`
 * is a plain function over `{ body, headers, secret }` so it slots into
 * Vercel's `Request`, Cloudflare's `Request`, or anything else once the
 * deploy target (still open — see `.notes/tech-sentinel-v1.spec.md`) is
 * decided.
 *
 * Verification and header/payload shapes are `@theholocron/github-client`'s
 * `verifyGitHubWebhookSignature()` / `parseGitHubWebhookHeaders()` /
 * `GitHub*WebhookPayload` — GitHub's own webhook mechanics, the same
 * "this package owns GitHub's raw JSON shapes" role that package already
 * plays for REST responses, not reimplemented per-consumer. What stays
 * here is Sentinel's own concern: which event categories matter in v1,
 * and what a normalized `SentinelEvent` looks like.
 *
 * D10 — org-portable by construction: every identifier (`repo`,
 * `installationId`) comes from the payload itself, never a hardcoded
 * org name, so one App registration handles N installations across N
 * orgs/accounts unchanged.
 *
 * v1 scope only reacts to the three event categories the spec lists —
 * everything else (installation `suspend`, `pull_request` `closed`, a
 * push to a non-default branch, any other `X-GitHub-Event`) comes back
 * `{ handled: false }` rather than throwing, since an unrecognized-but-
 * validly-signed delivery isn't an error, just not actionable in v1.
 */

import {
	type GitHubInstallationWebhookPayload,
	type GitHubPullRequestWebhookPayload,
	type GitHubPushWebhookPayload,
	parseGitHubWebhookHeaders,
	verifyGitHubWebhookSignature,
} from "@theholocron/github-client";

export type SentinelEventType =
	| "installation.created"
	| "installation.deleted"
	| "push.default-branch"
	| "pull_request.opened"
	| "pull_request.synchronize";

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

export class WebhookVerificationError extends Error {
	override name = "WebhookVerificationError";
}

export function parseWebhookEvent(input: ParseWebhookEventInput): ParseWebhookResult {
	const bodyStr = typeof input.body === "string" ? input.body : input.body.toString("utf8");
	const { event: githubEvent, delivery: deliveryId, signature } = parseGitHubWebhookHeaders(input.headers);

	if (!verifyGitHubWebhookSignature({ body: bodyStr, signature, secret: input.secret })) {
		throw new WebhookVerificationError("X-Hub-Signature-256 verification failed (or missing/empty secret)");
	}
	if (!githubEvent) {
		throw new WebhookVerificationError("Missing X-GitHub-Event header");
	}

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(bodyStr) as Record<string, unknown>;
	} catch (err) {
		// JSON.parse always throws a real SyntaxError (an Error instance); the
		// String(err) fallback exists for type-safety, not a reachable path.
		/* istanbul ignore next -- JSON.parse never throws a non-Error */
		throw new WebhookVerificationError(
			`Webhook body is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	switch (githubEvent) {
		case "installation": {
			const p = payload as unknown as GitHubInstallationWebhookPayload;
			if (p.action === "created" || p.action === "deleted") {
				return {
					handled: true,
					event: {
						type: p.action === "created" ? "installation.created" : "installation.deleted",
						installationId: p.installation.id,
						...(deliveryId ? { deliveryId } : {}),
						raw: payload,
					},
				};
			}
			return { handled: false, reason: `installation action "${p.action}" is not handled in v1`, githubEvent };
		}
		case "push": {
			const p = payload as unknown as GitHubPushWebhookPayload;
			if (p.ref !== `refs/heads/${p.repository.default_branch}`) {
				return { handled: false, reason: `push to "${p.ref}" is not the default branch`, githubEvent };
			}
			return {
				handled: true,
				event: {
					type: "push.default-branch",
					repo: p.repository.full_name,
					installationId: p.installation?.id ?? 0,
					...(deliveryId ? { deliveryId } : {}),
					raw: payload,
				},
			};
		}
		case "pull_request": {
			const p = payload as unknown as GitHubPullRequestWebhookPayload;
			if (p.action !== "opened" && p.action !== "synchronize") {
				return {
					handled: false,
					reason: `pull_request action "${p.action}" is not handled in v1`,
					githubEvent,
				};
			}
			return {
				handled: true,
				event: {
					type: p.action === "opened" ? "pull_request.opened" : "pull_request.synchronize",
					repo: p.repository.full_name,
					installationId: p.installation?.id ?? 0,
					...(deliveryId ? { deliveryId } : {}),
					raw: payload,
				},
			};
		}
		default:
			return { handled: false, reason: `"${githubEvent}" is not a v1 event category`, githubEvent };
	}
}
