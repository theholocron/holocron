import type { GitHubCheckRun, GitHubClient, GitHubPullRequest } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import type { RoleNotifications } from "../../role-sync/index.js";
import type { PrFeedTrigger } from "../pr-feed.type.js";
import { syncPullRequest } from "./sync-pull-request.js";

const NOW = new Date("2026-11-06T12:00:00Z");
const CHANNEL = { name: "prs", excludeRepos: [], excludeAuthors: [] as string[] };
const KEY = "acme/widgets#7";

const PULL: GitHubPullRequest = {
	number: 7,
	title: "feat: a thing",
	body: "",
	state: "open",
	merged_at: null,
	html_url: "https://github.com/acme/widgets/pull/7",
	head: { ref: "feat/a", sha: "abc1234567" },
	draft: false,
	created_at: "2026-11-05T12:00:00Z",
	user: { login: "luke", type: "User" },
	base: { ref: "alpha" },
	additions: 10,
	deletions: 2,
	changed_files: 3,
	mergeable_state: "blocked",
};

const run = (over: Partial<GitHubCheckRun>): GitHubCheckRun => ({
	id: 1,
	name: "ci / Required checks",
	head_sha: "abc1234567",
	status: "completed",
	conclusion: "failure",
	html_url: "https://example.test/agg",
	...over,
});

interface Setup {
	pull?: Partial<GitHubPullRequest>;
	runs?: GitHubCheckRun[];
	created?: boolean;
	deduped?: number;
	postClosed?: boolean;
	existing?: boolean;
	messages?: string[];
	channel?: typeof CHANNEL;
}

function setup(o: Setup = {}) {
	const notifications = {
		readDiscussion: vi.fn(async () => (o.existing === false ? undefined : { url: "u" })),
		ensureDiscussion: vi.fn(async () => ({
			post: { url: "u", closed: o.postClosed },
			created: o.created ?? false,
		})),
		updateDiscussion: vi.fn(async (_c: string, _k: string, _p: { closed?: boolean }): Promise<void> => undefined),
		dedupeDiscussion: vi.fn(async (..._a: unknown[]) => o.deduped ?? 0),
		postDiscussionMessage: vi.fn(async (..._a: unknown[]): Promise<void> => undefined),
		readDiscussionMessages: vi.fn(async () => o.messages ?? []),
	};
	const client = {
		pulls: { getPullRequest: vi.fn(async () => ({ ...PULL, ...o.pull })), listReviews: vi.fn(async () => []) },
		checks: { listCheckRunsForRef: vi.fn(async () => o.runs ?? []) },
	};
	const sync = (trigger: PrFeedTrigger) =>
		syncPullRequest({
			client: client as unknown as GitHubClient,
			notifications: notifications as unknown as RoleNotifications,
			channel: o.channel ?? CHANNEL,
			repo: "acme/widgets",
			number: 7,
			trigger,
			now: NOW,
		});
	return { notifications, client, sync };
}

const pr = (action: string): PrFeedTrigger => ({ kind: "pull_request", action, numbers: [7] });
const ci = (conclusion: string, over = {}): PrFeedTrigger => ({
	kind: "check_run",
	numbers: [7],
	check: {
		name: "ci / Required checks",
		headSha: "abc1234567",
		conclusion,
		url: "https://example.test/agg",
		...over,
	},
});

describe("syncPullRequest: the post", () => {
	it("makes a post quietly with the rendered title, body and tag, then de-duplicates", async () => {
		const { notifications, sync } = setup({ created: true });
		const result = await sync(pr("synchronize"));
		expect(notifications.ensureDiscussion).toHaveBeenCalledWith({
			channel: "prs",
			key: KEY,
			title: "widgets#7: feat: a thing",
			body: expect.stringContaining("**[acme/widgets#7]"),
			state: "waiting",
			quiet: true,
		});
		expect(notifications.dedupeDiscussion).toHaveBeenCalledWith("prs", KEY, { refresh: true });
		expect(notifications.updateDiscussion).not.toHaveBeenCalled();
		expect(result).toEqual({ number: 7, outcome: "created", posted: [] });
	});

	it("edits the summary and tag of a post that exists, without de-duplicating", async () => {
		const { notifications, sync } = setup({ pull: { draft: true } });
		const result = await sync(pr("converted_to_draft"));
		expect(notifications.updateDiscussion).toHaveBeenCalledWith("prs", KEY, {
			title: "widgets#7: feat: a thing",
			body: expect.any(String),
			state: "draft",
		});
		expect(notifications.dedupeDiscussion).not.toHaveBeenCalled();
		expect(notifications.postDiscussionMessage).not.toHaveBeenCalled();
		expect(result).toEqual({ number: 7, outcome: "updated", posted: [] });
	});

	it("skips an excluded author, any case, before making anything", async () => {
		const { notifications, sync } = setup({ channel: { ...CHANNEL, excludeAuthors: ["LUKE"] } });
		expect(await sync(pr("opened"))).toEqual({
			number: 7,
			outcome: "skipped",
			reason: "luke is excluded",
			posted: [],
		});
		expect(notifications.ensureDiscussion).not.toHaveBeenCalled();
	});

	it("skips a late delivery for a closed pull request", async () => {
		const { notifications, sync } = setup({ pull: { state: "closed" } });
		const result = await sync(pr("labeled"));
		expect(result).toMatchObject({ outcome: "skipped", reason: "the pull request is closed" });
		expect(notifications.ensureDiscussion).not.toHaveBeenCalled();
	});
});

describe("syncPullRequest: opened and reopened", () => {
	it("says it opened when it makes the post, without reading the thread", async () => {
		const { notifications, sync } = setup({ created: true });
		const result = await sync(pr("opened"));
		expect(notifications.readDiscussionMessages).not.toHaveBeenCalled();
		expect(notifications.postDiscussionMessage).toHaveBeenCalledWith(
			"prs",
			KEY,
			"🆕 Opened by luke into `alpha`: +10 −2 in 3 files\n-# pr: opened",
			{ quiet: true }
		);
		expect(result.posted).toEqual(["opened"]);
	});

	it("reads the thread when the de-duplication kept an older post, which may have its line already", async () => {
		const { notifications, sync } = setup({ created: true, deduped: 1, messages: ["x\n-# pr: opened", "summary"] });
		const result = await sync(pr("opened"));
		expect(notifications.readDiscussionMessages).toHaveBeenCalled();
		expect(notifications.postDiscussionMessage).not.toHaveBeenCalled();
		expect(result.posted).toEqual([]);
	});

	it("says it opened on the kept post when it has no line yet", async () => {
		const { notifications, sync } = setup({ created: true, deduped: 1, messages: ["summary"] });
		const result = await sync(pr("opened"));
		expect(notifications.postDiscussionMessage).toHaveBeenCalledTimes(1);
		expect(result.posted).toEqual(["opened"]);
	});

	it("does not say it opened twice on a redelivery", async () => {
		const { notifications, sync } = setup({ messages: ["x\n-# pr: opened", "summary"] });
		const result = await sync(pr("opened"));
		expect(notifications.postDiscussionMessage).not.toHaveBeenCalled();
		expect(result.posted).toEqual([]);
	});

	it("says it opened when the post existed but the line is missing", async () => {
		const { notifications, sync } = setup({ messages: ["summary"] });
		expect((await sync(pr("opened"))).posted).toEqual(["opened"]);
		expect(notifications.postDiscussionMessage).toHaveBeenCalledTimes(1);
	});

	it("reopens a closed post and says reopened once", async () => {
		const { notifications, sync } = setup({ postClosed: true, messages: ["x\n-# pr: closed"] });
		const result = await sync(pr("reopened"));
		expect(notifications.updateDiscussion).toHaveBeenCalledWith(
			"prs",
			KEY,
			expect.objectContaining({ closed: false })
		);
		expect(notifications.postDiscussionMessage).toHaveBeenCalledWith("prs", KEY, "🔄 Reopened\n-# pr: reopened", {
			quiet: true,
		});
		expect(result.posted).toEqual(["reopened"]);
	});

	it("does not reopen an open post", async () => {
		const { notifications, sync } = setup({ postClosed: false, messages: [] });
		await sync(pr("reopened"));
		expect(notifications.updateDiscussion).toHaveBeenCalledWith(
			"prs",
			KEY,
			expect.not.objectContaining({ closed: false })
		);
	});
});

describe("syncPullRequest: closed", () => {
	const merged = { state: "closed" as const, merged_at: "2026-11-06T00:00:00Z", merged_by: { login: "han" } };

	it("posts the last line, tags it merged, then closes the post, in that order", async () => {
		const { notifications, sync } = setup({ pull: merged, messages: [] });
		const order: string[] = [];
		notifications.updateDiscussion.mockImplementation(async (_c, _k, patch) => {
			order.push(patch.closed ? "close" : "retag");
		});
		notifications.postDiscussionMessage.mockImplementation(async () => {
			order.push("post");
		});
		const result = await sync(pr("closed"));
		expect(order).toEqual(["retag", "post", "close"]);
		expect(notifications.updateDiscussion).toHaveBeenCalledWith(
			"prs",
			KEY,
			expect.objectContaining({ state: "merged" })
		);
		expect(notifications.updateDiscussion).toHaveBeenLastCalledWith("prs", KEY, { closed: true });
		expect(notifications.postDiscussionMessage).toHaveBeenCalledWith(
			"prs",
			KEY,
			"🟣 Merged by han\n-# pr: closed",
			{
				quiet: true,
			}
		);
		expect(result.posted).toEqual(["closed"]);
	});

	it("tags a pull request closed without merging as closed", async () => {
		const { notifications, sync } = setup({ pull: { state: "closed" }, messages: [] });
		await sync(pr("closed"));
		expect(notifications.updateDiscussion).toHaveBeenCalledWith(
			"prs",
			KEY,
			expect.objectContaining({ state: "closed" })
		);
		expect(notifications.postDiscussionMessage).toHaveBeenCalledWith(
			"prs",
			KEY,
			"⚪ Closed without merging\n-# pr: closed",
			{ quiet: true }
		);
	});

	it("does not repeat the last line on a redelivery, but still closes the post", async () => {
		const { notifications, sync } = setup({ pull: merged, messages: ["x\n-# pr: closed"] });
		const result = await sync(pr("closed"));
		expect(notifications.postDiscussionMessage).not.toHaveBeenCalled();
		expect(notifications.updateDiscussion).toHaveBeenLastCalledWith("prs", KEY, { closed: true });
		expect(result.posted).toEqual([]);
	});

	it("makes no post for a pull request that never had one", async () => {
		const { notifications, sync } = setup({ pull: merged, existing: false });
		const result = await sync(pr("closed"));
		expect(result).toMatchObject({ outcome: "skipped", reason: "it has no post to close" });
		expect(notifications.ensureDiscussion).not.toHaveBeenCalled();
	});

	it("only re-renders when a closed delivery arrives for a pull request that has been reopened since", async () => {
		const { notifications, sync } = setup({ messages: [] });
		const result = await sync(pr("closed"));
		expect(result.posted).toEqual([]);
		expect(notifications.updateDiscussion).toHaveBeenCalledTimes(1);
		expect(notifications.updateDiscussion).not.toHaveBeenCalledWith("prs", KEY, { closed: true });
	});
});

describe("syncPullRequest: CI", () => {
	it("posts a quiet line for a pass", async () => {
		const { notifications, sync, client } = setup({ messages: ["summary"] });
		const result = await sync(ci("success"));
		expect(notifications.postDiscussionMessage).toHaveBeenCalledWith(
			"prs",
			KEY,
			"✅ CI passed on abc1234 ([run](https://example.test/agg))\n-# ci: abc1234567 success",
			{ quiet: true }
		);
		expect(result.posted).toEqual(["ci"]);
		// Reads the thread once for the marker; the list of checks read for the state is not read again.
		expect(client.checks.listCheckRunsForRef).toHaveBeenCalledTimes(1);
	});

	it("posts a loud message for a failure naming the failing checks, never the aggregate", async () => {
		const runs = [
			run({ id: 1 }),
			run({
				id: 2,
				name: "test:unit / Conclusion",
				conclusion: "failure",
				details_url: "https://example.test/u",
			}),
			run({ id: 3, name: "lint:code / Conclusion", conclusion: "timed_out" }),
			run({ id: 4, name: "build", conclusion: "success" }),
			run({ id: 5, name: "pending", conclusion: null, status: "in_progress" }),
		];
		const { notifications, sync } = setup({ runs });
		await sync(ci("failure", { detailsUrl: "https://example.test/runs/2" }));
		const [, , content, opts] = notifications.postDiscussionMessage.mock.calls[0] as unknown as [
			string,
			string,
			string,
			unknown,
		];
		expect(opts).toEqual({ quiet: false });
		expect(content).toContain("❌ CI failed on abc1234 (failure) ([run](https://example.test/runs/2))");
		expect(content).toContain("- [test:unit / Conclusion](https://example.test/u)");
		expect(content).toContain("- [lint:code / Conclusion](https://example.test/agg)");
		expect(content).not.toContain("[ci / Required checks]");
		expect(content).not.toContain("build");
		expect(content).toContain("[Every expected check](https://example.test/agg)");
		expect(content.endsWith("-# ci: abc1234567 failure")).toBe(true);
	});

	it("does not post a verdict twice", async () => {
		const { notifications, sync } = setup({ messages: ["❌ CI failed\n-# ci: abc1234567 failure"] });
		const result = await sync(ci("failure"));
		expect(notifications.postDiscussionMessage).not.toHaveBeenCalled();
		expect(result.posted).toEqual([]);
	});

	it("posts a new line for a new verdict on the same commit, or the same on a new commit", async () => {
		const { notifications, sync } = setup({ messages: ["x\n-# ci: abc1234567 failure"] });
		expect((await sync(ci("success"))).posted).toEqual(["ci"]);
		expect((await sync(ci("failure", { headSha: "def9999" }))).posted).toEqual(["ci"]);
		expect(notifications.postDiscussionMessage).toHaveBeenCalledTimes(2);
	});

	it("reads the checks of the commit that ran when the pull request has moved on", async () => {
		const { client, notifications, sync } = setup({ runs: [run({ id: 9, name: "old", conclusion: "failure" })] });
		await sync(ci("failure", { headSha: "oldsha00" }));
		expect(client.checks.listCheckRunsForRef).toHaveBeenLastCalledWith("acme/widgets", "oldsha00");
		const content = (notifications.postDiscussionMessage.mock.calls[0] as unknown as [string, string, string])[2];
		expect(content).toContain("- [old]");
	});

	it("says nothing about a pass for a review", async () => {
		const { notifications, sync } = setup();
		const result = await sync({ kind: "review", numbers: [7] });
		expect(notifications.readDiscussionMessages).not.toHaveBeenCalled();
		expect(result).toMatchObject({ outcome: "updated", posted: [] });
	});
});
