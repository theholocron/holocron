import type { GitHubClient } from "@theholocron/github-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAggregateChecks = vi.hoisted(() => vi.fn());
const postAggregate = vi.hoisted(() => vi.fn());
vi.mock("../read-aggregate-checks/index.js", () => ({ readAggregateChecks }));
vi.mock("@theholocron/astromech", () => ({ postAggregate }));

import type { CiAggregateTrigger } from "../ci-aggregate.type.js";
import { runCiAggregate } from "./run-ci-aggregate.js";

const CHECKS = { ok: true, expected: ["test:unit"], statuses: ["codecov/patch"] };
const SHADOW = { SENTINEL_CI_AGGREGATE: "shadow" };
const pull = (number: number, over: Record<string, unknown> = {}) => ({
	number,
	state: "open",
	head: { sha: "abc", ref: `feat/${number}` },
	base: { ref: "alpha" },
	...over,
});

function setup(pulls: Record<number, unknown>, byBranch: Record<string, unknown[]> = {}) {
	const client = {
		pulls: {
			getPullRequest: vi.fn(async (_repo: string, number: number) => {
				const found = pulls[number];
				if (found instanceof Error) throw found;
				return found;
			}),
			listOpenByHead: vi.fn(async (_repo: string, branch: string) => byBranch[branch] ?? []),
		},
	};
	return client;
}

const run = (client: unknown, trigger: Partial<CiAggregateTrigger>, over: Record<string, unknown> = {}) =>
	runCiAggregate({
		client: client as GitHubClient,
		env: SHADOW,
		repo: "acme/demo",
		trigger: { kind: "pull_request", pullRequests: [], branches: [], ...trigger },
		now: 1_000,
		...over,
	});

beforeEach(() => {
	readAggregateChecks.mockReset();
	readAggregateChecks.mockResolvedValue(CHECKS);
	postAggregate.mockReset();
	postAggregate.mockResolvedValue({ action: "created", result: { conclusion: "pending" } });
});

describe("runCiAggregate", () => {
	it("does nothing, and reads nothing, unless the deployment turned the shadow on", async () => {
		const client = setup({ 12: pull(12) });
		const out = await run(client, { pullRequests: [{ number: 12 }] }, { env: {} });
		expect(out).toEqual({ status: "skipped", reason: "SENTINEL_CI_AGGREGATE is not shadow" });
		expect(client.pulls.getPullRequest).not.toHaveBeenCalled();
	});

	it("posts the shadow aggregate for a pull request, from the base branch's checks and the head commit", async () => {
		const client = setup({ 12: pull(12) });
		const out = await run(client, { pullRequests: [{ number: 12, baseRef: "alpha" }], sha: "abc" });
		expect(out).toEqual({
			status: "ok",
			posted: [{ number: 12, action: "created", conclusion: "pending" }],
			skipped: [],
		});
		expect(readAggregateChecks).toHaveBeenCalledWith(
			expect.objectContaining({ repo: "acme/demo", baseRef: "alpha", now: 1_000 })
		);
		expect(postAggregate).toHaveBeenCalledWith(
			expect.objectContaining({
				sha: "abc",
				expected: ["test:unit"],
				statuses: ["codecov/patch"],
				now: 1_000,
				name: "ci / Required checks (sentinel)",
				refreshOutput: true,
			})
		);
	});

	it("takes the name and the time it is given, and the clock otherwise", async () => {
		const client = setup({ 12: pull(12) });
		await run(client, { pullRequests: [{ number: 12 }] }, { name: "ci / Required checks", now: undefined });
		const call = postAggregate.mock.calls[0]![0];
		expect(call.name).toBe("ci / Required checks");
		expect(call.now).toBeGreaterThan(1_000_000);
	});

	it("skips a pull request that is closed, whose head moved on, or that names no base branch", async () => {
		const client = setup({
			1: pull(1, { state: "closed" }),
			2: pull(2, { head: { sha: "new", ref: "x" } }),
			3: pull(3, { base: undefined }),
		});
		const out = await run(client, { pullRequests: [{ number: 1 }, { number: 2 }, { number: 3 }], sha: "abc" });
		expect(out).toEqual({
			status: "ok",
			posted: [],
			skipped: [
				{ number: 1, reason: "closed" },
				{ number: 2, reason: "not the head commit any more" },
				{ number: 3, reason: "the pull request names no base branch" },
			],
		});
		expect(postAggregate).not.toHaveBeenCalled();
	});

	it("skips a pull request of a repo with no usable config", async () => {
		readAggregateChecks.mockResolvedValue({ ok: false, reason: "no config" });
		const out = await run(setup({ 12: pull(12) }), { pullRequests: [{ number: 12 }] });
		expect(out).toMatchObject({ skipped: [{ number: 12, reason: "no config" }] });
	});

	it("drops a finished check run it does not wait for, and takes one it does, by id prefix or status context", async () => {
		const client = setup({ 12: pull(12) });
		const trigger = { kind: "check_run" as const, pullRequests: [{ number: 12 }], sha: "abc" };
		expect(await run(client, { ...trigger, name: "docs-site / Conclusion" })).toMatchObject({
			skipped: [{ number: 12, reason: "not a check the aggregate waits for" }],
		});
		expect(await run(client, { ...trigger, name: "test:unit / Conclusion" })).toMatchObject({
			posted: [{ number: 12 }],
		});
		expect(await run(client, { ...trigger, name: "codecov/patch" })).toMatchObject({ posted: [{ number: 12 }] });
		expect(await run(client, trigger)).toMatchObject({
			skipped: [{ reason: "not a check the aggregate waits for" }],
		});
		expect(postAggregate).toHaveBeenCalledTimes(2);
	});

	it("takes a status only for a context in statuses, never for an id prefix, and finds its pull requests by branch", async () => {
		const client = setup(
			{ 12: pull(12), 13: pull(13) },
			{
				"feat/a": [pull(12), pull(99, { head: { sha: "other", ref: "feat/a" } })],
				"feat/b": [pull(12), pull(13)],
			}
		);
		const trigger = { kind: "status" as const, sha: "abc", branches: ["feat/a", "feat/b"], name: "codecov/patch" };
		const out = await run(client, trigger);
		expect(out).toMatchObject({ status: "ok", posted: [{ number: 12 }, { number: 13 }] });
		expect(client.pulls.listOpenByHead).toHaveBeenCalledTimes(2);
		expect(await run(client, { ...trigger, name: "test:unit / Conclusion" })).toMatchObject({
			skipped: [
				{ reason: "not a check the aggregate waits for" },
				{ reason: "not a check the aggregate waits for" },
			],
		});
	});

	it("is skipped when a status has no open pull request, or a delivery names none", async () => {
		const client = setup({});
		expect(await run(client, { kind: "status", sha: "abc", branches: ["feat/a"], name: "codecov/patch" })).toEqual({
			status: "skipped",
			reason: "no open pull request for this delivery",
		});
		expect(await run(client, { pullRequests: [] })).toEqual({
			status: "skipped",
			reason: "no open pull request for this delivery",
		});
	});

	it("reads each pull request once however often the delivery names it", async () => {
		const client = setup({ 12: pull(12) });
		await run(client, { pullRequests: [{ number: 12 }, { number: 12 }] });
		expect(client.pulls.getPullRequest).toHaveBeenCalledTimes(1);
	});

	it("goes on past a pull request that fails, and reports every failure", async () => {
		const client = setup({ 1: new Error("boom"), 2: pull(2), 3: "nope" as unknown });
		client.pulls.getPullRequest.mockImplementation(async (_repo: string, number: number) => {
			if (number === 1) throw new Error("boom");
			if (number === 3) throw "nope";
			return pull(number);
		});
		const out = await run(client, { pullRequests: [{ number: 1 }, { number: 2 }, { number: 3 }] });
		expect(out).toEqual({ status: "fail", reason: "#1: boom; #3: nope" });
		expect(postAggregate).toHaveBeenCalledTimes(1);
	});

	it("fails, rather than throws, when the pull requests of a status cannot be listed", async () => {
		const client = setup({});
		client.pulls.listOpenByHead.mockRejectedValue(new Error("rate limited"));
		expect(await run(client, { kind: "status", sha: "abc", branches: ["feat/a"], name: "codecov/patch" })).toEqual({
			status: "fail",
			reason: "rate limited",
		});
	});
});
