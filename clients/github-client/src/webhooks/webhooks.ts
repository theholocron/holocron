import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * GitHub's own webhook mechanics — signature verification and header/
 * payload shapes. Pure functions, no REST call, no auth token: these
 * operate on an *inbound* delivery, the mirror of everything else this
 * package does (outbound REST calls), so they're standalone exports
 * rather than part of `createGitHubClient()`'s returned object.
 *
 * A consumer (a GitHub App receiving webhooks) owns what to *do* with a
 * verified delivery — which event categories matter, how to normalize
 * them — the same split `holocron-plugin-clerk`'s `parseWebhook` draws
 * between Svix verification and Clerk-specific `AuthEvent` normalization,
 * just with the verification half living here instead of inline, since
 * "how GitHub signs and shapes a webhook" is vendor knowledge this
 * package already owns for every other GitHub API surface.
 */

/**
 * Verifies a GitHub webhook delivery's `X-Hub-Signature-256` header —
 * HMAC-SHA256 over the raw body, keyed by the webhook's configured
 * secret, `timingSafeEqual`-compared.
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 *
 * Returns `false` (never throws) for any failure to verify — a missing/
 * empty secret, a missing/malformed signature header, or a mismatch —
 * so the caller decides how to surface that (e.g. as its own error type).
 */
export function verifyGitHubWebhookSignature(input: {
	body: string | Buffer;
	signature: string | undefined;
	secret: string;
}): boolean {
	const prefix = "sha256=";
	if (!input.secret || !input.signature || !input.signature.startsWith(prefix)) return false;

	const bodyStr = typeof input.body === "string" ? input.body : input.body.toString("utf8");
	const provided = Buffer.from(input.signature.slice(prefix.length), "hex");
	const computed = createHmac("sha256", input.secret).update(bodyStr).digest();
	return provided.length === computed.length && timingSafeEqual(provided, computed);
}

export interface GitHubWebhookHeaders {
	/** `X-GitHub-Event` — the event category, e.g. `"push"`, `"pull_request"`. */
	event: string | undefined;
	/** `X-GitHub-Delivery` — GitHub's per-delivery id, useful for idempotency/logging. */
	delivery: string | undefined;
	/** `X-Hub-Signature-256` — pass straight to `verifyGitHubWebhookSignature`. */
	signature: string | undefined;
}

/** Extracts GitHub's three webhook headers, case-insensitively (Node's raw headers may arrive lower-cased, or as an array when a header repeats). */
export function parseGitHubWebhookHeaders(
	headers: Record<string, string | string[] | undefined>
): GitHubWebhookHeaders {
	const find = (name: string): string | undefined => {
		const target = name.toLowerCase();
		for (const [k, v] of Object.entries(headers)) {
			if (k.toLowerCase() === target) return Array.isArray(v) ? v[0] : v;
		}
		return undefined;
	};
	return {
		event: find("x-github-event"),
		delivery: find("x-github-delivery"),
		signature: find("x-hub-signature-256"),
	};
}

// ── webhook payload shapes ──────────────────────────────────────────
// GitHub's own JSON shapes for the delivery bodies a consumer will see,
// scoped to the fields Holocron's own GitHub App (Sentinel) reads today
// — not a full re-typing of every field GitHub sends.

export interface GitHubInstallationWebhookPayload {
	action: string;
	installation: { id: number };
}

export interface GitHubPushWebhookPayload {
	ref: string;
	installation?: { id: number };
	repository: { full_name: string; default_branch: string };
}

export interface GitHubPullRequestWebhookPayload {
	action: string;
	installation?: { id: number };
	repository: { full_name: string };
}
