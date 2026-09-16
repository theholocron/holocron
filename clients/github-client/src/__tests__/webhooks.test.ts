import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseGitHubWebhookHeaders, verifyGitHubWebhookSignature } from "../webhooks/webhooks.js";

const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
	return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyGitHubWebhookSignature", () => {
	it("returns true for a correctly signed body", () => {
		const body = JSON.stringify({ a: 1 });
		expect(verifyGitHubWebhookSignature({ body, signature: sign(body), secret: SECRET })).toBe(true);
	});

	it("returns true for a Buffer body signed identically to its string form", () => {
		const body = JSON.stringify({ a: 1 });
		expect(
			verifyGitHubWebhookSignature({ body: Buffer.from(body, "utf8"), signature: sign(body), secret: SECRET })
		).toBe(true);
	});

	it("returns false when the secret is empty", () => {
		const body = "{}";
		expect(verifyGitHubWebhookSignature({ body, signature: sign(body), secret: "" })).toBe(false);
	});

	it("returns false when the signature is undefined", () => {
		expect(verifyGitHubWebhookSignature({ body: "{}", signature: undefined, secret: SECRET })).toBe(false);
	});

	it("returns false when the signature lacks the sha256= prefix", () => {
		expect(verifyGitHubWebhookSignature({ body: "{}", signature: "not-a-real-sig", secret: SECRET })).toBe(false);
	});

	it("returns false when the signature doesn't match the body", () => {
		const body = JSON.stringify({ a: 1 });
		expect(verifyGitHubWebhookSignature({ body, signature: sign(JSON.stringify({ a: 2 })), secret: SECRET })).toBe(
			false
		);
	});

	it("returns false when the signature was computed with a different secret", () => {
		const body = JSON.stringify({ a: 1 });
		expect(verifyGitHubWebhookSignature({ body, signature: sign(body, "wrong-secret"), secret: SECRET })).toBe(
			false
		);
	});

	it("returns false on a signature of mismatched length rather than throwing", () => {
		expect(verifyGitHubWebhookSignature({ body: "{}", signature: "sha256=aa", secret: SECRET })).toBe(false);
	});
});

describe("parseGitHubWebhookHeaders", () => {
	it("extracts event, delivery, and signature headers", () => {
		const result = parseGitHubWebhookHeaders({
			"x-github-event": "push",
			"x-github-delivery": "delivery-123",
			"x-hub-signature-256": "sha256=abc",
		});
		expect(result).toEqual({ event: "push", delivery: "delivery-123", signature: "sha256=abc" });
	});

	it("is case-insensitive", () => {
		const result = parseGitHubWebhookHeaders({
			"X-GitHub-Event": "installation",
			"X-GitHub-Delivery": "delivery-456",
			"X-Hub-Signature-256": "sha256=def",
		});
		expect(result).toEqual({ event: "installation", delivery: "delivery-456", signature: "sha256=def" });
	});

	it("takes the first value when a header arrives as an array", () => {
		const result = parseGitHubWebhookHeaders({ "x-github-event": ["push", "push"] });
		expect(result.event).toBe("push");
	});

	it("returns undefined for headers that aren't present", () => {
		const result = parseGitHubWebhookHeaders({});
		expect(result).toEqual({ event: undefined, delivery: undefined, signature: undefined });
	});
});
