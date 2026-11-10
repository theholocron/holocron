import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postErrorReview, SENTINEL_BOT_LOGINS } from "./post-error-review.js";

// Both Sentinel Apps resolve the stale threads of their own review (holocron#1968): the dev instance is a different
// App (`The Holocron Sentinel - dev`), and GraphQL gives its login as `the-holocron-sentinel-dev`, without `[bot]`.

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

const thread = (authorLogin: string) => ({
	body: {
		data: {
			repository: {
				pullRequest: {
					reviewThreads: {
						nodes: [
							{
								id: "PRRT_OLD",
								isResolved: false,
								path: "src/index.ts",
								line: 5,
								comments: {
									nodes: [
										{
											author: { login: authorLogin },
											body: "<!-- sentinel:static-analysis -->\n`no-unused-vars` (line 5): fixed already",
										},
									],
								},
							},
						],
					},
				},
			},
		},
	},
});

const RESOLVED = { body: { data: { resolveReviewThread: { thread: { id: "PRRT_OLD", isResolved: true } } } } };

const input = {
	repo: "acme/demo",
	pullNumber: 42,
	headSha: "abc123",
	checkKey: "static-analysis",
	checkLabel: "static analysis",
	checkRunName: "Static Analysis / Run eslint",
	errors: [],
	warningCount: 0,
};

describe("SENTINEL_BOT_LOGINS", () => {
	it("holds the production App's login and the dev App's, as GraphQL gives them", () => {
		expect([...SENTINEL_BOT_LOGINS]).toEqual(["the-holocron-sentinel", "the-holocron-sentinel-dev"]);
	});
});

describe("postErrorReview: whose stale threads are resolved", () => {
	it.each(["the-holocron-sentinel", "the-holocron-sentinel-dev"])(
		"resolves a stale thread written by %s",
		async (login) => {
			const { client, calls } = makeClient([thread(login), RESOLVED]);

			await postErrorReview({ ...input, client });

			expect(calls).toHaveLength(2);
			expect((calls[1]?.body as { variables: unknown }).variables).toEqual({ threadId: "PRRT_OLD" });
		}
	);

	it.each(["octocat", "the-holocron-sentinel-dev[bot]", "not-the-holocron-sentinel", "the-holocron-sentinel-evil"])(
		"leaves a stale-looking thread written by %s alone",
		async (login) => {
			const { client, calls } = makeClient([thread(login)]);

			await postErrorReview({ ...input, client });

			expect(calls).toHaveLength(1);
		}
	);
});
