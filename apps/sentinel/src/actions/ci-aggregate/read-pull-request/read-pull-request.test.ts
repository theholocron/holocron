import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { PULL_REQUEST_TTL_MS, readPullRequest } from "./read-pull-request.js";
import type { AggregatePullRequest } from "./read-pull-request.type.js";

const pr = (over: Record<string, unknown> = {}) =>
	({
		number: 7,
		state: "open",
		head: { sha: "abc", ref: "feat/x" },
		base: { ref: "alpha" },
		...over,
	}) as unknown as AggregatePullRequest;

function clientOf(...answers: AggregatePullRequest[]) {
	const getPullRequest = vi.fn(async () => answers.shift() ?? pr());
	return { client: { pulls: { getPullRequest } } as unknown as GitHubClient, getPullRequest };
}

const read = (client: GitHubClient, over: Record<string, unknown> = {}) => {
	const cache = new Map();
	return {
		cache,
		call: (extra: Record<string, unknown> = {}) =>
			readPullRequest({ client, repo: "a/b", number: 7, sha: "abc", now: 1_000, cache, ...over, ...extra }),
	};
};

describe("readPullRequest", () => {
	it("reads once for a burst about the same commit", async () => {
		const { client, getPullRequest } = clientOf(pr());
		const { call } = read(client);
		await call();
		await call({ now: 1_000 + PULL_REQUEST_TTL_MS - 1 });
		expect(getPullRequest).toHaveBeenCalledTimes(1);
	});

	it("reads again after the time is up", async () => {
		const { client, getPullRequest } = clientOf(pr(), pr());
		const { call } = read(client);
		await call();
		await call({ now: 1_000 + PULL_REQUEST_TTL_MS });
		expect(getPullRequest).toHaveBeenCalledTimes(2);
	});

	it("reads again for another commit, because a push moved the head", async () => {
		const { client, getPullRequest } = clientOf(pr(), pr({ head: { sha: "def", ref: "feat/x" } }));
		const { call } = read(client);
		await call();
		const second = await call({ sha: "def" });
		expect(getPullRequest).toHaveBeenCalledTimes(2);
		expect(second.head.sha).toBe("def");
	});

	it("never answers from memory when the delivery names no commit", async () => {
		const { client, getPullRequest } = clientOf(pr(), pr());
		const { call } = read(client);
		await call();
		await call({ sha: undefined });
		expect(getPullRequest).toHaveBeenCalledTimes(2);
	});

	it("does not keep a closed pull request", async () => {
		const { client, getPullRequest } = clientOf(pr({ state: "closed" }), pr({ state: "closed" }));
		const { call, cache } = read(client);
		await call();
		await call();
		expect(cache.size).toBe(0);
		expect(getPullRequest).toHaveBeenCalledTimes(2);
	});

	it("forgets an open read once the pull request is seen closed", async () => {
		const { client } = clientOf(pr(), pr({ state: "closed" }));
		const { call, cache } = read(client);
		await call();
		expect(cache.size).toBe(1);
		await call({ now: 1_000 + PULL_REQUEST_TTL_MS });
		expect(cache.size).toBe(0);
	});
});
