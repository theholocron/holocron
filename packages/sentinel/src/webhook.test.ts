import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseWebhookEvent, WebhookVerificationError } from "./webhook.js";

// Deterministic test secret — not a real credential.
const SECRET = "test-webhook-secret";

function sign(body: string, secret = SECRET): string {
	return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function signedHeaders(
	body: string,
	githubEvent: string,
	overrides: Record<string, string | undefined> = {}
): Record<string, string | string[] | undefined> {
	return {
		"x-github-event": githubEvent,
		"x-hub-signature-256": sign(body),
		"x-github-delivery": "delivery-123",
		...overrides,
	};
}

describe("parseWebhookEvent — signature verification", () => {
	it("throws when secret is empty", () => {
		const err = (() => {
			try {
				parseWebhookEvent({ body: "{}", headers: {}, secret: "" });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as WebhookVerificationError).message).toMatch(/secret is required/);
	});

	it("throws when the signature header is missing", () => {
		const err = (() => {
			try {
				parseWebhookEvent({ body: "{}", headers: { "x-github-event": "push" }, secret: SECRET });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as WebhookVerificationError).message).toMatch(/Missing or malformed/);
	});

	it("throws when the signature header is malformed (no sha256= prefix)", () => {
		const err = (() => {
			try {
				parseWebhookEvent({
					body: "{}",
					headers: { "x-github-event": "push", "x-hub-signature-256": "not-a-real-sig" },
					secret: SECRET,
				});
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
	});

	it("throws when the signature doesn't match the body", () => {
		const body = JSON.stringify({ a: 1 });
		const err = (() => {
			try {
				parseWebhookEvent({
					body,
					headers: { "x-github-event": "push", "x-hub-signature-256": sign(JSON.stringify({ a: 2 })) },
					secret: SECRET,
				});
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as WebhookVerificationError).message).toMatch(/verification failed/);
	});

	it("throws when the signature was computed with a different secret", () => {
		const body = JSON.stringify({ a: 1 });
		const err = (() => {
			try {
				parseWebhookEvent({
					body,
					headers: { "x-github-event": "push", "x-hub-signature-256": sign(body, "wrong-secret") },
					secret: SECRET,
				});
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
	});

	it("throws on a signature of mismatched length rather than crashing", () => {
		const body = "{}";
		const err = (() => {
			try {
				parseWebhookEvent({
					body,
					headers: { "x-github-event": "push", "x-hub-signature-256": "sha256=aa" },
					secret: SECRET,
				});
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
	});

	it("accepts a Buffer body signed identically to its string form", () => {
		const body = JSON.stringify({
			action: "opened",
			installation: { id: 1 },
			repository: { full_name: "acme/widgets" },
		});
		const result = parseWebhookEvent({
			body: Buffer.from(body, "utf8"),
			headers: signedHeaders(body, "pull_request"),
			secret: SECRET,
		});
		expect(result.handled).toBe(true);
	});

	it("takes the first value when a header arrives as an array (Node's raw-header shape)", () => {
		const body = JSON.stringify({ action: "created", installation: { id: 5 } });
		const result = parseWebhookEvent({
			body,
			headers: { "x-github-event": ["installation"], "x-hub-signature-256": [sign(body)] },
			secret: SECRET,
		});
		expect(result.handled).toBe(true);
	});

	it("finds headers case-insensitively", () => {
		const body = JSON.stringify({
			action: "created",
			installation: { id: 42 },
		});
		const result = parseWebhookEvent({
			body,
			headers: {
				"X-GitHub-Event": "installation",
				"X-Hub-Signature-256": sign(body),
			},
			secret: SECRET,
		});
		expect(result.handled).toBe(true);
	});
});

describe("parseWebhookEvent — malformed payload", () => {
	it("throws WebhookVerificationError when the body isn't valid JSON", () => {
		const body = "{ not json";
		const err = (() => {
			try {
				parseWebhookEvent({ body, headers: signedHeaders(body, "push"), secret: SECRET });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as WebhookVerificationError).message).toMatch(/not valid JSON/);
	});

	it("throws when X-GitHub-Event is missing", () => {
		const body = "{}";
		const err = (() => {
			try {
				parseWebhookEvent({
					body,
					headers: { "x-hub-signature-256": sign(body) },
					secret: SECRET,
				});
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(WebhookVerificationError);
		expect((err as WebhookVerificationError).message).toMatch(/X-GitHub-Event/);
	});
});

describe("parseWebhookEvent — installation events", () => {
	it("normalizes an installation.created action", () => {
		const body = JSON.stringify({ action: "created", installation: { id: 99 } });
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "installation"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { type: string; installationId: number } }).event).toMatchObject({
			type: "installation.created",
			installationId: 99,
			deliveryId: "delivery-123",
		});
	});

	it("normalizes an installation.deleted action", () => {
		const body = JSON.stringify({ action: "deleted", installation: { id: 99 } });
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "installation"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { type: string } }).event.type).toBe("installation.deleted");
	});

	it("leaves an unhandled installation action (e.g. suspend) unhandled", () => {
		const body = JSON.stringify({ action: "suspend", installation: { id: 99 } });
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "installation"), secret: SECRET });
		expect(result.handled).toBe(false);
		expect((result as { reason: string }).reason).toMatch(/suspend/);
	});
});

describe("parseWebhookEvent — push events", () => {
	it("normalizes a push to the default branch", () => {
		const body = JSON.stringify({
			ref: "refs/heads/main",
			installation: { id: 7 },
			repository: { full_name: "acme/widgets", default_branch: "main" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "push"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { type: string; repo?: string; installationId: number } }).event).toMatchObject({
			type: "push.default-branch",
			repo: "acme/widgets",
			installationId: 7,
		});
	});

	it("leaves a push to a non-default branch unhandled", () => {
		const body = JSON.stringify({
			ref: "refs/heads/feature/x",
			installation: { id: 7 },
			repository: { full_name: "acme/widgets", default_branch: "main" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "push"), secret: SECRET });
		expect(result.handled).toBe(false);
		expect((result as { reason: string }).reason).toMatch(/not the default branch/);
	});

	it("defaults installationId to 0 when the payload omits it", () => {
		const body = JSON.stringify({
			ref: "refs/heads/main",
			repository: { full_name: "acme/widgets", default_branch: "main" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "push"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { installationId: number } }).event.installationId).toBe(0);
	});

	it("omits deliveryId when X-GitHub-Delivery is absent", () => {
		const body = JSON.stringify({
			ref: "refs/heads/main",
			installation: { id: 7 },
			repository: { full_name: "acme/widgets", default_branch: "main" },
		});
		const result = parseWebhookEvent({
			body,
			headers: { "x-github-event": "push", "x-hub-signature-256": sign(body) },
			secret: SECRET,
		});
		expect(result.handled).toBe(true);
		expect((result as { event: { deliveryId?: string } }).event.deliveryId).toBeUndefined();
	});

	it("is org-portable — resolves entirely from payload fields, not a hardcoded org (D10)", () => {
		const body = JSON.stringify({
			ref: "refs/heads/trunk",
			installation: { id: 1 },
			repository: { full_name: "some-other-org/some-repo", default_branch: "trunk" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "push"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { repo?: string } }).event.repo).toBe("some-other-org/some-repo");
	});
});

describe("parseWebhookEvent — pull_request events", () => {
	it("normalizes a pull_request.opened action", () => {
		const body = JSON.stringify({
			action: "opened",
			installation: { id: 3 },
			repository: { full_name: "acme/widgets" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { type: string; repo?: string } }).event).toMatchObject({
			type: "pull_request.opened",
			repo: "acme/widgets",
		});
	});

	it("normalizes a pull_request.synchronize action", () => {
		const body = JSON.stringify({
			action: "synchronize",
			installation: { id: 3 },
			repository: { full_name: "acme/widgets" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { type: string } }).event.type).toBe("pull_request.synchronize");
	});

	it("omits deliveryId when X-GitHub-Delivery is absent", () => {
		const body = JSON.stringify({
			action: "opened",
			installation: { id: 3 },
			repository: { full_name: "acme/widgets" },
		});
		const result = parseWebhookEvent({
			body,
			headers: { "x-github-event": "pull_request", "x-hub-signature-256": sign(body) },
			secret: SECRET,
		});
		expect(result.handled).toBe(true);
		expect((result as { event: { deliveryId?: string } }).event.deliveryId).toBeUndefined();
	});

	it("defaults installationId to 0 when the payload omits it", () => {
		const body = JSON.stringify({
			action: "opened",
			repository: { full_name: "acme/widgets" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: { installationId: number } }).event.installationId).toBe(0);
	});

	it("leaves an unhandled pull_request action (e.g. closed) unhandled", () => {
		const body = JSON.stringify({
			action: "closed",
			installation: { id: 3 },
			repository: { full_name: "acme/widgets" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
		expect(result.handled).toBe(false);
		expect((result as { reason: string }).reason).toMatch(/closed/);
	});
});

describe("parseWebhookEvent — unrecognized event categories", () => {
	it("leaves a validly-signed but out-of-v1-scope event category unhandled, not an error", () => {
		const body = JSON.stringify({ action: "opened" });
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "issues"), secret: SECRET });
		expect(result.handled).toBe(false);
		expect((result as { githubEvent: string }).githubEvent).toBe("issues");
	});
});
