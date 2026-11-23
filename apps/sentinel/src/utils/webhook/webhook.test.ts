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
		expect((err as WebhookVerificationError).message).toMatch(/verification failed/);
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
		expect((err as WebhookVerificationError).message).toMatch(/verification failed/);
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

	it("normalizes a pull_request.edited action that changed the title or the description", () => {
		for (const changes of [{ title: { from: "old" } }, { body: { from: null } }]) {
			const body = JSON.stringify({
				action: "edited",
				changes,
				installation: { id: 3 },
				repository: { full_name: "acme/widgets" },
			});
			const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
			expect(result.handled).toBe(true);
			expect((result as { event: { type: string } }).event.type).toBe("pull_request.edited");
		}
	});

	it("falls back to installation 0 and omits deliveryId for an edit without them", () => {
		const body = JSON.stringify({
			action: "edited",
			changes: { title: { from: "old" } },
			repository: { full_name: "acme/widgets" },
		});
		const headers = signedHeaders(body, "pull_request", { "x-github-delivery": undefined });
		const result = parseWebhookEvent({ body, headers, secret: SECRET });
		const event = (result as { event: { installationId: number; deliveryId?: string } }).event;
		expect(event.installationId).toBe(0);
		expect(event.deliveryId).toBeUndefined();
	});

	it("sends a pull_request.edited action that changed neither (a base branch change, say) to the feed only", () => {
		for (const changes of [{ base: { ref: { from: "main" } } }, undefined]) {
			const body = JSON.stringify({
				action: "edited",
				number: 8,
				...(changes ? { changes } : {}),
				installation: { id: 3 },
				repository: { full_name: "acme/widgets" },
			});
			const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
			expect((result as { event: unknown }).event).toMatchObject({
				type: "pull_request.feed",
				action: "edited",
				pullNumbers: [8],
			});
		}
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

	it("leaves a pull_request action nobody reads (e.g. assigned) unhandled", () => {
		const body = JSON.stringify({
			action: "assigned",
			number: 5,
			installation: { id: 3 },
			repository: { full_name: "acme/widgets" },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
		expect(result.handled).toBe(false);
		expect((result as { reason: string }).reason).toMatch(/assigned/);
	});

	it("sends the feed-only actions to the feed, with the action and the pull request number", () => {
		const actions = [
			"reopened",
			"ready_for_review",
			"converted_to_draft",
			"review_requested",
			"review_request_removed",
			"labeled",
			"closed",
		];
		for (const action of actions) {
			const body = JSON.stringify({
				action,
				number: 5,
				installation: { id: 3 },
				repository: { full_name: "acme/widgets" },
			});
			const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
			expect((result as { event: unknown }).event).toMatchObject({
				type: "pull_request.feed",
				repo: "acme/widgets",
				installationId: 3,
				action,
				pullNumbers: [5],
				deliveryId: "delivery-123",
			});
		}
	});

	it("reads the number from pull_request.number, and leaves a feed action with no number unhandled", () => {
		const withNested = JSON.stringify({
			action: "closed",
			pull_request: { number: 9 },
			repository: { full_name: "acme/widgets" },
		});
		const nested = parseWebhookEvent({
			body: withNested,
			headers: signedHeaders(withNested, "pull_request"),
			secret: SECRET,
		});
		expect((nested as { event: { pullNumbers: number[] } }).event.pullNumbers).toEqual([9]);

		const none = JSON.stringify({ action: "closed", repository: { full_name: "acme/widgets" } });
		const result = parseWebhookEvent({ body: none, headers: signedHeaders(none, "pull_request"), secret: SECRET });
		expect(result.handled).toBe(false);
	});

	it("carries the action and number on opened, which the checks handle", () => {
		const body = JSON.stringify({ action: "opened", number: 4, repository: { full_name: "acme/widgets" } });
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
		expect((result as { event: unknown }).event).toMatchObject({
			type: "pull_request.opened",
			action: "opened",
			pullNumbers: [4],
		});
	});
});

describe("parseWebhookEvent — pull_request_review events", () => {
	const review = (action: string) =>
		JSON.stringify({
			action,
			pull_request: { number: 12 },
			installation: { id: 3 },
			repository: { full_name: "acme/widgets" },
		});

	it("normalizes a submitted or dismissed review", () => {
		for (const action of ["submitted", "dismissed"]) {
			const body = review(action);
			const result = parseWebhookEvent({
				body,
				headers: signedHeaders(body, "pull_request_review"),
				secret: SECRET,
			});
			expect((result as { event: unknown }).event).toMatchObject({
				type: "pull_request_review",
				repo: "acme/widgets",
				installationId: 3,
				action,
				pullNumbers: [12],
			});
		}
	});

	it("defaults the installation and omits the delivery id when they are absent", () => {
		const body = JSON.stringify({
			action: "submitted",
			pull_request: { number: 12 },
			repository: { full_name: "acme/widgets" },
		});
		const headers = signedHeaders(body, "pull_request_review", { "x-github-delivery": undefined });
		const event = (
			parseWebhookEvent({ body, headers, secret: SECRET }) as unknown as { event: Record<string, unknown> }
		).event;
		expect(event["installationId"]).toBe(0);
		expect(event["deliveryId"]).toBeUndefined();
	});

	it("leaves an edited review unhandled", () => {
		const body = review("edited");
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request_review"), secret: SECRET });
		expect(result.handled).toBe(false);
	});
});

describe("parseWebhookEvent — check_run events", () => {
	const run = (over: Record<string, unknown> = {}, action = "completed") =>
		JSON.stringify({
			action,
			check_run: {
				name: "ci / Required checks",
				head_sha: "abc1234",
				conclusion: "failure",
				html_url: "https://github.com/acme/widgets/runs/1",
				details_url: "https://github.com/acme/widgets/actions/runs/2",
				pull_requests: [{ number: 12 }, { number: 13 }],
				...over,
			},
			installation: { id: 3 },
			repository: { full_name: "acme/widgets" },
		});

	it("normalizes the completed aggregate with its pull requests, commit, conclusion and links", () => {
		const body = run();
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "check_run"), secret: SECRET });
		expect((result as { event: unknown }).event).toMatchObject({
			type: "check_run.completed",
			repo: "acme/widgets",
			installationId: 3,
			action: "completed",
			pullNumbers: [12, 13],
			checkRun: {
				name: "ci / Required checks",
				headSha: "abc1234",
				conclusion: "failure",
				url: "https://github.com/acme/widgets/runs/1",
				detailsUrl: "https://github.com/acme/widgets/actions/runs/2",
			},
		});
	});

	it("omits the details link and delivery id when absent, and defaults the installation", () => {
		const body = JSON.stringify({
			action: "completed",
			check_run: {
				name: "ci / Required checks",
				head_sha: "abc1234",
				conclusion: "success",
				html_url: "https://example.test/r",
				details_url: null,
				pull_requests: [],
			},
			repository: { full_name: "acme/widgets" },
		});
		const headers = signedHeaders(body, "check_run", { "x-github-delivery": undefined });
		const event = (
			parseWebhookEvent({ body, headers, secret: SECRET }) as unknown as { event: Record<string, unknown> }
		).event;
		expect(event["checkRun"]).not.toHaveProperty("detailsUrl");
		expect(event["pullNumbers"]).toEqual([]);
		expect(event["installationId"]).toBe(0);
		expect(event["deliveryId"]).toBeUndefined();
	});

	it("leaves the shadow aggregate's own completion, and any created check run, unhandled", () => {
		for (const body of [
			run({ name: "ci / Required checks (sentinel)" }),
			run({ name: "test:unit / Conclusion" }, "created"),
		]) {
			const result = parseWebhookEvent({ body, headers: signedHeaders(body, "check_run"), secret: SECRET });
			expect(result.handled).toBe(false);
		}
	});

	it("normalizes any other completed check run as a leaf for the ci aggregate, with each pull request's base branch", () => {
		const body = run({
			name: "test:unit / Conclusion",
			pull_requests: [{ number: 12, base: { ref: "alpha" } }, { number: 13 }],
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "check_run"), secret: SECRET });
		expect((result as { event: unknown }).event).toMatchObject({
			type: "check_run.leaf",
			repo: "acme/widgets",
			installationId: 3,
			action: "completed",
			headSha: "abc1234",
			checkName: "test:unit / Conclusion",
			pullNumbers: [12, 13],
			pullRequests: [{ number: 12, baseRef: "alpha" }, { number: 13 }],
		});
	});

	it("normalizes a Re-run on the aggregate or its shadow, and leaves the delivery id out when absent", () => {
		for (const name of ["ci / Required checks", "ci / Required checks (sentinel)"]) {
			const body = run({ name }, "rerequested");
			const headers = signedHeaders(body, "check_run", { "x-github-delivery": undefined });
			const event = (
				parseWebhookEvent({ body, headers, secret: SECRET }) as unknown as { event: Record<string, unknown> }
			).event;
			expect(event).toMatchObject({ type: "check_run.rerequested", checkName: name, headSha: "abc1234" });
			expect(event["deliveryId"]).toBeUndefined();
		}
		const other = run({ name: "test:unit / Conclusion" }, "rerequested");
		expect(
			parseWebhookEvent({ body: other, headers: signedHeaders(other, "check_run"), secret: SECRET }).handled
		).toBe(false);
	});

	it("defaults the installation of a leaf with none", () => {
		const body = JSON.stringify({
			action: "completed",
			check_run: { name: "a / b", head_sha: "s", conclusion: "success", html_url: "u", pull_requests: [] },
			repository: { full_name: "acme/widgets" },
		});
		const event = (
			parseWebhookEvent({ body, headers: signedHeaders(body, "check_run"), secret: SECRET }) as unknown as {
				event: { installationId: number; pullRequests: unknown[] };
			}
		).event;
		expect(event.installationId).toBe(0);
		expect(event.pullRequests).toEqual([]);
	});
});

describe("parseWebhookEvent — status events", () => {
	const status = (extra: Record<string, unknown> = {}) =>
		JSON.stringify({
			sha: "abc1234",
			context: "codecov/patch",
			state: "success",
			branches: [{ name: "feat/x" }, { name: "alpha" }],
			repository: { full_name: "acme/widgets" },
			installation: { id: 3 },
			...extra,
		});

	it("normalizes a commit status with its commit, context and branches", () => {
		const body = status();
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "status"), secret: SECRET });
		expect((result as { event: unknown }).event).toMatchObject({
			type: "status",
			repo: "acme/widgets",
			installationId: 3,
			headSha: "abc1234",
			checkName: "codecov/patch",
			branches: ["feat/x", "alpha"],
		});
	});

	it("copes with a status that names no branches, no installation and no delivery id", () => {
		const body = status({ branches: undefined, installation: undefined });
		const headers = signedHeaders(body, "status", { "x-github-delivery": undefined });
		const event = (
			parseWebhookEvent({ body, headers, secret: SECRET }) as unknown as { event: Record<string, unknown> }
		).event;
		expect(event["branches"]).toEqual([]);
		expect(event["installationId"]).toBe(0);
		expect(event["deliveryId"]).toBeUndefined();
	});
});

describe("parseWebhookEvent — pull request head and base", () => {
	it("carries the head commit and the base branch of a pull request delivery for the ci aggregate", () => {
		const body = JSON.stringify({
			action: "synchronize",
			number: 5,
			pull_request: { number: 5, head: { sha: "headsha" }, base: { ref: "alpha" } },
			repository: { full_name: "acme/widgets" },
			installation: { id: 3 },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET });
		expect((result as { event: unknown }).event).toMatchObject({
			type: "pull_request.synchronize",
			headSha: "headsha",
			pullRequests: [{ number: 5, baseRef: "alpha" }],
		});
	});

	it("leaves them out when the payload has no pull request object or number", () => {
		const body = JSON.stringify({
			action: "opened",
			repository: { full_name: "acme/widgets" },
			installation: { id: 3 },
		});
		const event = (
			parseWebhookEvent({ body, headers: signedHeaders(body, "pull_request"), secret: SECRET }) as unknown as {
				event: Record<string, unknown>;
			}
		).event;
		expect(event).not.toHaveProperty("headSha");
		expect(event).not.toHaveProperty("pullRequests");
		const noBase = JSON.stringify({
			action: "opened",
			number: 6,
			pull_request: { number: 6 },
			repository: { full_name: "acme/widgets" },
		});
		const second = (
			parseWebhookEvent({
				body: noBase,
				headers: signedHeaders(noBase, "pull_request"),
				secret: SECRET,
			}) as unknown as {
				event: Record<string, unknown>;
			}
		).event;
		expect(second["pullRequests"]).toEqual([{ number: 6 }]);
	});
});

describe("parseWebhookEvent — unrecognized event categories", () => {
	it("leaves a validly-signed but out-of-v1-scope event category unhandled, not an error", () => {
		const body = JSON.stringify({ action: "opened" });
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "star"), secret: SECRET });
		expect(result.handled).toBe(false);
		expect((result as { githubEvent: string }).githubEvent).toBe("star");
	});
});

describe("parseWebhookEvent — issues events (area labels)", () => {
	const issue = (action: string, extra: Record<string, unknown> = {}, installation = true) =>
		JSON.stringify({
			action,
			issue: { number: 9 },
			repository: { full_name: "acme/demo" },
			...(installation ? { installation: { id: 7 } } : {}),
			...extra,
		});
	const parse = (body: string) => parseWebhookEvent({ body, headers: signedHeaders(body, "issues"), secret: SECRET });

	it("handles an opened issue, naming the issue and the repo", () => {
		const result = parse(issue("opened"));
		expect(result.handled).toBe(true);
		expect((result as { event: unknown }).event).toMatchObject({
			type: "issues.area",
			repo: "acme/demo",
			installationId: 7,
			action: "opened",
			issueNumber: 9,
		});
	});

	it("handles an edit that changed the title, with no installation id sent", () => {
		const result = parse(issue("edited", { changes: { title: { from: "old" } } }, false));
		expect((result as { event: unknown }).event).toMatchObject({ type: "issues.area", installationId: 0 });
	});

	it("leaves an edit of the body and any other action unhandled", () => {
		for (const body of [
			issue("edited", { changes: { body: { from: "old" } } }),
			issue("edited"),
			issue("closed"),
		]) {
			expect(parse(body).handled).toBe(false);
		}
	});

	it("carries the delivery id when GitHub sends one, and none when it does not", () => {
		const body = issue("opened");
		const event = (headers: Record<string, string | string[] | undefined>) =>
			(parseWebhookEvent({ body, headers, secret: SECRET }) as unknown as { event: Record<string, unknown> })
				.event;
		expect(event(signedHeaders(body, "issues"))["deliveryId"]).toBe("delivery-123");
		expect(event(signedHeaders(body, "issues", { "x-github-delivery": undefined }))["deliveryId"]).toBeUndefined();
	});
});

describe("parseWebhookEvent — team membership events", () => {
	const membership = (over: Record<string, unknown> = {}) =>
		JSON.stringify({
			action: "added",
			scope: "team",
			team: { slug: "gatekeepers" },
			organization: { login: "acme" },
			installation: { id: 9 },
			...over,
		});

	it("normalizes a person added to a team, with the org and the team", () => {
		const body = membership();
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "membership"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: unknown }).event).toMatchObject({
			type: "team.membership",
			org: "acme",
			team: "gatekeepers",
			installationId: 9,
			deliveryId: "delivery-123",
		});
	});

	it("normalizes a person removed from a team, with no installation and no delivery id", () => {
		const body = membership({ action: "removed", installation: undefined });
		const result = parseWebhookEvent({
			body,
			headers: { "x-github-event": "membership", "x-hub-signature-256": sign(body) },
			secret: SECRET,
		});
		const event = (result as { event: { installationId: number; deliveryId?: string } }).event;
		expect(event.installationId).toBe(0);
		expect(event.deliveryId).toBeUndefined();
	});

	it("ignores a membership that is not of a team, and an action that is not added or removed", () => {
		for (const over of [{ scope: "organization" }, { action: "edited" }]) {
			const body = membership(over);
			const result = parseWebhookEvent({ body, headers: signedHeaders(body, "membership"), secret: SECRET });
			expect(result.handled).toBe(false);
			expect((result as { githubEvent: string }).githubEvent).toBe("membership");
		}
	});
});

describe("parseWebhookEvent — organization events", () => {
	it("normalizes a member removed from the organisation", () => {
		const body = JSON.stringify({
			action: "member_removed",
			organization: { login: "acme" },
			installation: { id: 4 },
		});
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "organization"), secret: SECRET });
		expect(result.handled).toBe(true);
		expect((result as { event: unknown }).event).toMatchObject({
			type: "organization.member-removed",
			org: "acme",
			installationId: 4,
			deliveryId: "delivery-123",
		});
	});

	it("defaults the installation to 0 and leaves out the delivery id when neither is sent", () => {
		const body = JSON.stringify({ action: "member_removed", organization: { login: "acme" } });
		const result = parseWebhookEvent({
			body,
			headers: { "x-github-event": "organization", "x-hub-signature-256": sign(body) },
			secret: SECRET,
		});
		const event = (result as { event: { installationId: number; deliveryId?: string } }).event;
		expect(event.installationId).toBe(0);
		expect(event.deliveryId).toBeUndefined();
	});

	it("ignores any other organization action", () => {
		const body = JSON.stringify({ action: "member_added", organization: { login: "acme" } });
		const result = parseWebhookEvent({ body, headers: signedHeaders(body, "organization"), secret: SECRET });
		expect(result.handled).toBe(false);
		expect((result as { githubEvent: string }).githubEvent).toBe("organization");
	});
});
