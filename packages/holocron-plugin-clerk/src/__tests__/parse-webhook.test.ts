import { WebhookVerificationError, type ParseWebhookInput } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { parseWebhook } from "../parse-webhook.js";

function input(overrides: Partial<ParseWebhookInput> = {}): ParseWebhookInput {
	return {
		body: "",
		headers: {},
		signingSecret: "whsec_test",
		...overrides,
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

describe("parseWebhook", () => {
	it("maps Clerk user.created to the normalized AuthEvent shape", async () => {
		const event = await parseWebhook(input({ body: clerkBody() }));
		expect(event.type).toBe("user.created");
		expect(event.user.id).toBe("user_2abc");
		expect(event.user.email).toBe("jane@example.com");
		expect(event.user.firstName).toBe("Jane");
		expect(event.user.lastName).toBe("Doe");
		expect(event.occurredAt).toBe("2025-01-01T00:00:00.000Z");
	});

	it("picks the primary email when the user has multiple", async () => {
		const event = await parseWebhook(
			input({
				body: clerkBody({
					data: {
						id: "user_x",
						email_addresses: [
							{ id: "idn_alt", email_address: "alt@example.com" },
							{ id: "idn_primary", email_address: "primary@example.com" },
						],
						primary_email_address_id: "idn_primary",
					},
				}),
			})
		);
		expect(event.user.email).toBe("primary@example.com");
	});

	it("falls back to the first email when no primary is marked", async () => {
		const event = await parseWebhook(
			input({
				body: clerkBody({
					data: {
						id: "user_x",
						email_addresses: [{ email_address: "only@example.com" }],
					},
				}),
			})
		);
		expect(event.user.email).toBe("only@example.com");
	});

	it("handles user.updated event type", async () => {
		const event = await parseWebhook(input({ body: clerkBody({ type: "user.updated" }) }));
		expect(event.type).toBe("user.updated");
	});

	it("handles user.deleted event type", async () => {
		const event = await parseWebhook(input({ body: clerkBody({ type: "user.deleted" }) }));
		expect(event.type).toBe("user.deleted");
	});

	it("preserves provider-native fields in the `raw` slot", async () => {
		const event = await parseWebhook(input({ body: clerkBody() }));
		expect(event.user.raw).toMatchObject({
			id: "user_2abc",
			primary_email_address_id: "idn_1",
		});
	});

	it("throws WebhookVerificationError when signingSecret is missing", async () => {
		try {
			await parseWebhook({ body: clerkBody(), headers: {}, signingSecret: "" });
			throw new Error("expected throw");
		} catch (err) {
			expect(err).toBeInstanceOf(WebhookVerificationError);
			expect((err as Error).message).toMatch(/whsec_/);
		}
	});

	it("throws on malformed JSON body", async () => {
		try {
			await parseWebhook(input({ body: "{ this is not json" }));
			throw new Error("expected throw");
		} catch (err) {
			expect(err).toBeInstanceOf(WebhookVerificationError);
			expect((err as Error).message).toMatch(/not valid JSON/);
		}
	});

	it("throws on unmapped event types (e.g. session.created)", async () => {
		try {
			await parseWebhook(input({ body: clerkBody({ type: "session.created" }) }));
			throw new Error("expected throw");
		} catch (err) {
			expect(err).toBeInstanceOf(WebhookVerificationError);
			expect((err as Error).message).toMatch(/session\.created/);
		}
	});

	it("accepts Buffer body (Node http request shape)", async () => {
		const event = await parseWebhook(input({ body: Buffer.from(clerkBody(), "utf8") }));
		expect(event.user.id).toBe("user_2abc");
	});
});
