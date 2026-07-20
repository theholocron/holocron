/**
 * Translates a Clerk webhook delivery into the normalized `AuthEvent`
 * shape defined in `@theholocron/cli`, with full Svix HMAC-SHA256
 * signature verification (closes #80).
 *
 * Verification algorithm (https://docs.svix.com/receiving/verifying-payloads/how-manual):
 *   1. Require svix-id, svix-timestamp, svix-signature headers
 *   2. Reject if svix-timestamp is outside the ±5-minute replay window
 *   3. Decode the whsec_<base64> signing secret
 *   4. Compute HMAC-SHA256(secretBytes, "${id}.${timestamp}.${body}")
 *   5. Constant-time compare against each v1,<base64> signature in the
 *      space-separated svix-signature header (supports key rotation)
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { WebhookVerificationError, type AuthEvent, type AuthEventType, type ParseWebhookInput } from "@theholocron/cli";

interface ClerkWebhookPayload {
	type: string;
	data: {
		id: string;
		email_addresses?: Array<{ email_address: string; id?: string }>;
		primary_email_address_id?: string;
		first_name?: string | null;
		last_name?: string | null;
		[key: string]: unknown;
	};
	/** Unix ms — Clerk's `created_at` on the envelope. */
	created_at?: number;
}

const CLERK_TO_NORMALIZED: Record<string, AuthEventType> = {
	"user.created": "user.created",
	"user.updated": "user.updated",
	"user.deleted": "user.deleted",
};

const REPLAY_WINDOW_SECONDS = 5 * 60;

export async function parseWebhook(input: ParseWebhookInput): Promise<AuthEvent> {
	await verifySignature(input);

	const bodyStr = typeof input.body === "string" ? input.body : input.body.toString("utf8");
	let payload: ClerkWebhookPayload;
	try {
		payload = JSON.parse(bodyStr) as ClerkWebhookPayload;
	} catch (err) {
		throw new WebhookVerificationError(
			`Clerk webhook body is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	const normalizedType = CLERK_TO_NORMALIZED[payload.type];
	if (!normalizedType) {
		throw new WebhookVerificationError(`Clerk webhook event type "${payload.type}" has no normalized mapping yet`);
	}

	const primaryEmail =
		payload.data.email_addresses?.find((e) => e.id === payload.data.primary_email_address_id)?.email_address ??
		payload.data.email_addresses?.[0]?.email_address;

	const occurredAt = payload.created_at ? new Date(payload.created_at).toISOString() : new Date(0).toISOString();

	return {
		type: normalizedType,
		user: {
			id: payload.data.id,
			email: primaryEmail ?? "",
			...(payload.data.first_name !== undefined ? { firstName: payload.data.first_name } : {}),
			...(payload.data.last_name !== undefined ? { lastName: payload.data.last_name } : {}),
			raw: payload.data,
		},
		occurredAt,
	};
}

async function verifySignature(input: ParseWebhookInput): Promise<void> {
	if (!input.signingSecret) {
		throw new WebhookVerificationError(
			"Clerk webhook signingSecret is required (use the Svix whsec_… value from the Clerk dashboard)"
		);
	}

	const lower = (s: string) => s.toLowerCase();
	const h = (name: string): string | undefined => {
		const target = lower(name);
		for (const [k, v] of Object.entries(input.headers)) {
			if (lower(k) === target) return Array.isArray(v) ? v[0] : (v as string | undefined);
		}
		return undefined;
	};

	const svixId = h("svix-id");
	const svixTimestamp = h("svix-timestamp");
	const svixSignature = h("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		throw new WebhookVerificationError("Missing required Svix headers: svix-id, svix-timestamp, svix-signature");
	}

	const ts = parseInt(svixTimestamp, 10);
	if (isNaN(ts)) {
		throw new WebhookVerificationError(`Invalid svix-timestamp: "${svixTimestamp}"`);
	}
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (Math.abs(nowSeconds - ts) > REPLAY_WINDOW_SECONDS) {
		throw new WebhookVerificationError(
			`Message timestamp is outside the ${REPLAY_WINDOW_SECONDS / 60}-minute replay window`
		);
	}

	const secretBase64 = input.signingSecret.startsWith("whsec_")
		? input.signingSecret.slice("whsec_".length)
		: input.signingSecret;
	const secretBytes = Buffer.from(secretBase64, "base64");

	const bodyStr = typeof input.body === "string" ? input.body : input.body.toString("utf8");
	const toSign = `${svixId}.${svixTimestamp}.${bodyStr}`;
	const computed = createHmac("sha256", secretBytes).update(toSign).digest();

	const matched = svixSignature.split(" ").some((sig) => {
		const comma = sig.indexOf(",");
		if (comma === -1 || sig.slice(0, comma) !== "v1") return false;
		let sigBytes: Buffer;
		try {
			sigBytes = Buffer.from(sig.slice(comma + 1), "base64");
		} catch {
			return false;
		}
		if (sigBytes.length !== computed.length) return false;
		return timingSafeEqual(sigBytes, computed);
	});

	if (!matched) {
		throw new WebhookVerificationError("Svix signature verification failed");
	}
}
