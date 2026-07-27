import { createHmac } from "node:crypto";

import { type ParseWebhookInput,WebhookVerificationError } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { parseWebhook } from "../parse-webhook.js";

// ── test fixture helpers ──────────────────────────────────────────────────────

// Deterministic 32-byte test secret (all zeros).
const TEST_SECRET_BYTES = Buffer.alloc(32);
const TEST_SECRET = `whsec_${TEST_SECRET_BYTES.toString("base64")}`;
const TEST_MSG_ID = "msg_test_001";

/** Compute a valid Svix HMAC-SHA256 signature for the given inputs. */
function sign(body: string, id: string, ts: number, secret = TEST_SECRET_BYTES): string {
	return createHmac("sha256", secret).update(`${id}.${ts}.${body}`).digest("base64");
}

/** Build a fully-signed ParseWebhookInput. */
function signedInput(
	body: string,
	opts: {
		id?: string;
		ts?: number;
		secret?: string;
		extraHeaders?: Record<string, string>;
	} = {}
): ParseWebhookInput {
	const id = opts.id ?? TEST_MSG_ID;
	const ts = opts.ts ?? Math.floor(Date.now() / 1000);
	const secret = opts.secret ?? TEST_SECRET;
	const secretBytes = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
	const sig = sign(body, id, ts, secretBytes);
	return {
		body,
		signingSecret: secret,
		headers: {
			"svix-id": id,
			"svix-timestamp": String(ts),
			"svix-signature": `v1,${sig}`,
			...opts.extraHeaders,
		},
	};
}

function clerkBody(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		type: "user.created",
		data: {
			id: "user_2abc",
			email_addresses: [
				{ id: "idn_1", email_address: "jane@example.com" },
				{ id: "idn_2", email_address: "jane.alt@example.com" },
			],
			primary_email_address_id: "idn_1",
			first_name: "Jane",
			last_name: "Doe",
		},
		created_at: 1735689600000, // 2025-01-01T00:00:00Z
		...overrides,
	});
}

// ── body-parsing tests (require a valid signature) ────────────────────────────

describe("parseWebhook — body parsing", () => {
	it("maps Clerk user.created to the normalized AuthEvent shape", async () => {
		const body = clerkBody();
		const event = await parseWebhook(signedInput(body));
		expect(event.type).toBe("user.created");
		expect(event.user.id).toBe("user_2abc");
		expect(event.user.email).toBe("jane@example.com");
		expect(event.user.firstName).toBe("Jane");
		expect(event.user.lastName).toBe("Doe");
		expect(event.occurredAt).toBe("2025-01-01T00:00:00.000Z");
	});

	it("picks the primary email when the user has multiple", async () => {
		const body = clerkBody({
			data: {
				id: "user_x",
				email_addresses: [
					{ id: "idn_alt", email_address: "alt@example.com" },
					{ id: "idn_primary", email_address: "primary@example.com" },
				],
				primary_email_address_id: "idn_primary",
			},
		});
		const event = await parseWebhook(signedInput(body));
		expect(event.user.email).toBe("primary@example.com");
	});

	it("falls back to the first email when no primary is marked", async () => {
		const body = clerkBody({
			data: {
				id: "user_x",
				email_addresses: [{ email_address: "only@example.com" }],
			},
		});
		const event = await parseWebhook(signedInput(body));
		expect(event.user.email).toBe("only@example.com");
	});

	it("handles user.updated event type", async () => {
		const body = clerkBody({ type: "user.updated" });
		const event = await parseWebhook(signedInput(body));
		expect(event.type).toBe("user.updated");
	});

	it("handles user.deleted event type", async () => {
		const body = clerkBody({ type: "user.deleted" });
		const event = await parseWebhook(signedInput(body));
		expect(event.type).toBe("user.deleted");
	});

	it("preserves provider-native fields in the `raw` slot", async () => {
		const event = await parseWebhook(signedInput(clerkBody()));
		expect(event.user.raw).toMatchObject({
			id: "user_2abc",
			primary_email_address_id: "idn_1",
		});
	});

	it("accepts Buffer body (Node http request shape)", async () => {
		const body = clerkBody();
		const input = signedInput(body);
		const event = await parseWebhook({ ...input, body: Buffer.from(body, "utf8") });
		expect(event.user.id).toBe("user_2abc");
	});

	it("throws on malformed JSON body", async () => {
		const badBody = "{ this is not json";
		const err = await parseWebhook(signedInput(badBody)).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/not valid JSON/);
	});

	it("throws on unmapped event types (e.g. session.created)", async () => {
		const body = clerkBody({ type: "session.created" });
		const err = await parseWebhook(signedInput(body)).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/session\.created/);
	});

	it("falls back to empty email when email_addresses is absent", async () => {
		const body = JSON.stringify({ type: "user.created", data: { id: "user_x" }, created_at: 1735689600000 });
		const event = await parseWebhook(signedInput(body));
		expect(event.user.email).toBe("");
	});

	it("uses epoch timestamp when created_at is absent", async () => {
		const body = JSON.stringify({ type: "user.created", data: { id: "user_x", email_addresses: [] } });
		const event = await parseWebhook(signedInput(body));
		expect(event.occurredAt).toBe(new Date(0).toISOString());
	});

	it("omits firstName/lastName from user when absent in payload", async () => {
		const body = clerkBody({ data: { id: "user_x", email_addresses: [{ id: "e", email_address: "a@b.com" }] } });
		const event = await parseWebhook(signedInput(body));
		expect(event.user).not.toHaveProperty("firstName");
		expect(event.user).not.toHaveProperty("lastName");
	});
});

// ── Svix signature verification tests ────────────────────────────────────────

describe("parseWebhook — Svix signature verification", () => {
	it("accepts a correctly signed request", async () => {
		const body = clerkBody();
		await expect(parseWebhook(signedInput(body))).resolves.toMatchObject({ type: "user.created" });
	});

	it("rejects when signingSecret is missing", async () => {
		const err = await parseWebhook({ body: clerkBody(), headers: {}, signingSecret: "" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/whsec_/);
	});

	it("rejects when Svix headers are absent", async () => {
		const err = await parseWebhook({
			body: clerkBody(),
			signingSecret: TEST_SECRET,
			headers: {},
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/svix-id/);
	});

	it("rejects when the signature does not match the body", async () => {
		const body = clerkBody();
		const input = signedInput(body);
		// Tamper with the body after signing
		const err = await parseWebhook({ ...input, body: body + " tampered" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/verification failed/);
	});

	it("rejects a completely invalid signature value", async () => {
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);
		const err = await parseWebhook({
			body,
			signingSecret: TEST_SECRET,
			headers: {
				"svix-id": TEST_MSG_ID,
				"svix-timestamp": String(ts),
				"svix-signature": "v1,invalidsignature==",
			},
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/verification failed/);
	});

	it("rejects a replay outside the 5-minute window", async () => {
		const body = clerkBody();
		const expiredTs = Math.floor(Date.now() / 1000) - 6 * 60; // 6 minutes ago
		const sig = sign(body, TEST_MSG_ID, expiredTs);
		const err = await parseWebhook({
			body,
			signingSecret: TEST_SECRET,
			headers: {
				"svix-id": TEST_MSG_ID,
				"svix-timestamp": String(expiredTs),
				"svix-signature": `v1,${sig}`,
			},
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/replay window/);
	});

	it("accepts a future timestamp within the 5-minute window", async () => {
		const body = clerkBody();
		const futureTs = Math.floor(Date.now() / 1000) + 4 * 60; // 4 minutes in future
		const sig = sign(body, TEST_MSG_ID, futureTs);
		await expect(
			parseWebhook({
				body,
				signingSecret: TEST_SECRET,
				headers: {
					"svix-id": TEST_MSG_ID,
					"svix-timestamp": String(futureTs),
					"svix-signature": `v1,${sig}`,
				},
			})
		).resolves.toMatchObject({ type: "user.created" });
	});

	it("accepts when any signature in a space-separated rotation set matches", async () => {
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);

		// oldSig uses a different (rotated-out) key — won't match
		const oldSecretBytes = Buffer.alloc(32, 0xff);
		const oldSig = sign(body, TEST_MSG_ID, ts, oldSecretBytes);
		// newSig uses the current key — will match
		const newSig = sign(body, TEST_MSG_ID, ts);

		await expect(
			parseWebhook({
				body,
				signingSecret: TEST_SECRET,
				headers: {
					"svix-id": TEST_MSG_ID,
					"svix-timestamp": String(ts),
					"svix-signature": `v1,${oldSig} v1,${newSig}`,
				},
			})
		).resolves.toMatchObject({ type: "user.created" });
	});

	it("rejects if none of the rotation signatures match", async () => {
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);

		const wrongSecretBytes = Buffer.alloc(32, 0xff);
		const wrongSig1 = sign(body, TEST_MSG_ID, ts, wrongSecretBytes);
		const wrongSig2 = sign(body, TEST_MSG_ID, ts, Buffer.alloc(32, 0xaa));

		const err = await parseWebhook({
			body,
			signingSecret: TEST_SECRET,
			headers: {
				"svix-id": TEST_MSG_ID,
				"svix-timestamp": String(ts),
				"svix-signature": `v1,${wrongSig1} v1,${wrongSig2}`,
			},
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/verification failed/);
	});

	it("accepts a signing secret without the whsec_ prefix (raw base64)", async () => {
		const rawSecret = TEST_SECRET_BYTES.toString("base64");
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);
		const sig = sign(body, TEST_MSG_ID, ts);
		await expect(
			parseWebhook({
				body,
				signingSecret: rawSecret,
				headers: {
					"svix-id": TEST_MSG_ID,
					"svix-timestamp": String(ts),
					"svix-signature": `v1,${sig}`,
				},
			})
		).resolves.toMatchObject({ type: "user.created" });
	});

	it("accepts headers with array values (multi-value HTTP header format)", async () => {
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);
		const sig = sign(body, TEST_MSG_ID, ts);
		await expect(
			parseWebhook({
				body,
				signingSecret: TEST_SECRET,
				headers: {
					"svix-id": [TEST_MSG_ID] as unknown as string,
					"svix-timestamp": String(ts),
					"svix-signature": `v1,${sig}`,
				},
			})
		).resolves.toMatchObject({ type: "user.created" });
	});

	it("rejects a non-numeric svix-timestamp", async () => {
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);
		const sig = sign(body, TEST_MSG_ID, ts);
		const err = await parseWebhook({
			body,
			signingSecret: TEST_SECRET,
			headers: {
				"svix-id": TEST_MSG_ID,
				"svix-timestamp": "not-a-number",
				"svix-signature": `v1,${sig}`,
			},
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/Invalid svix-timestamp/);
	});

	it("skips a malformed base64 signature and throws when no valid signature remains", async () => {
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);
		const err = await parseWebhook({
			body,
			signingSecret: TEST_SECRET,
			headers: {
				"svix-id": TEST_MSG_ID,
				"svix-timestamp": String(ts),
				"svix-signature": "v1,!!!not-base64!!!",
			},
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as Error).message).toMatch(/verification failed/);
	});

	it("header lookup is case-insensitive", async () => {
		const body = clerkBody();
		const ts = Math.floor(Date.now() / 1000);
		const sig = sign(body, TEST_MSG_ID, ts);
		await expect(
			parseWebhook({
				body,
				signingSecret: TEST_SECRET,
				headers: {
					"Svix-Id": TEST_MSG_ID,
					"Svix-Timestamp": String(ts),
					"Svix-Signature": `v1,${sig}`,
				},
			})
		).resolves.toMatchObject({ type: "user.created" });
	});
});
