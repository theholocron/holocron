import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import type { LoadPrFeedResult } from "../load-pr-feed/index.js";
import type { PrFeedTrigger } from "../pr-feed.type.js";
import { runPrFeed } from "./run-pr-feed.js";

const ENV = { SENTINEL_ROLE_SYNC_REPO: "acme/holocron", HOLOCRON_DISCORD_BOT_TOKEN: "bot" };

function notifications() {
	return {
		readDiscussion: vi.fn(async () => ({ url: "u" })),
		ensureDiscussion: vi.fn(async () => ({ post: { url: "u" }, created: false })),
		updateDiscussion: vi.fn(async () => undefined),
		dedupeDiscussion: vi.fn(async () => 0),
		postDiscussionMessage: vi.fn(async () => undefined),
		readDiscussionMessages: vi.fn(async () => [] as string[]),
	};
}

function setup(over: { archived?: boolean; load?: LoadPrFeedResult; excludeRepos?: string[] } = {}) {
	const n = notifications();
	const client = {
		repos: { getRepo: vi.fn(async () => ({ archived: over.archived ?? false })) },
		pulls: {
			getPullRequest: vi.fn(async (_repo: string, number: number) => ({
				number,
				title: `pr ${number}`,
				state: "open",
				merged_at: null,
				html_url: "u",
				head: { ref: "b", sha: "s" },
			})),
			listReviews: vi.fn(async () => []),
		},
		checks: { listCheckRunsForRef: vi.fn(async () => []) },
	};
	const loadFeed = vi.fn(
		async () =>
			over.load ??
			({
				ok: true,
				notifications: n,
				channel: { name: "prs", excludeRepos: over.excludeRepos ?? [], excludeAuthors: [] },
			} as unknown as LoadPrFeedResult)
	);
	const go = (trigger: PrFeedTrigger, repo = "acme/widgets") =>
		runPrFeed({ client: client as unknown as GitHubClient, env: ENV, repo, trigger, loadFeed });
	return { n, client, loadFeed, go };
}

const pr = (numbers = [1]): PrFeedTrigger => ({ kind: "pull_request", action: "synchronize", numbers });
const check = (over = {}): PrFeedTrigger => ({
	kind: "check_run",
	numbers: [1],
	check: { name: "ci / Required checks", headSha: "s", conclusion: "success", url: "u", ...over },
});

describe("runPrFeed", () => {
	it("is skipped, quietly, when the feed is not set up", async () => {
		const { go, client } = setup({ load: { ok: false, reason: "the pull request feed is off: X is not set" } });
		expect(await go(pr())).toEqual({ status: "skipped", reason: "the pull request feed is off: X is not set" });
		expect(client.repos.getRepo).not.toHaveBeenCalled();
	});

	it("uses the real loader unless given another, which is off without the settings", async () => {
		const { client } = setup();
		const result = await runPrFeed({
			client: client as unknown as GitHubClient,
			env: {},
			repo: "acme/widgets",
			trigger: pr(),
		});
		expect(result).toMatchObject({ status: "skipped", reason: expect.stringContaining("SENTINEL_ROLE_SYNC_REPO") });
	});

	it("counts ages to the given time", async () => {
		const { client, n, loadFeed } = setup();
		await runPrFeed({
			client: client as unknown as GitHubClient,
			env: ENV,
			repo: "acme/widgets",
			trigger: pr(),
			now: new Date("2026-11-06T00:00:00Z"),
			loadFeed,
		});
		expect(n.ensureDiscussion).toHaveBeenCalledTimes(1);
	});

	it("loads the feed for the repository's organisation", async () => {
		const { go, loadFeed, client } = setup();
		await go(pr());
		expect(loadFeed).toHaveBeenCalledWith({ client, env: ENV, org: "acme" });
	});

	it("is skipped for an excluded repository, any case, before fetching anything", async () => {
		const { go, client } = setup({ excludeRepos: ["ACME/Widgets"] });
		expect(await go(pr())).toEqual({ status: "skipped", reason: "acme/widgets is excluded" });
		expect(client.repos.getRepo).not.toHaveBeenCalled();
	});

	it("is skipped for an archived repository", async () => {
		const { go, client } = setup({ archived: true });
		expect(await go(pr())).toEqual({ status: "skipped", reason: "acme/widgets is archived" });
		expect(client.pulls.getPullRequest).not.toHaveBeenCalled();
	});

	it("syncs every pull request of the delivery", async () => {
		const { go, n } = setup();
		const result = await go(pr([1, 2]));
		expect(result).toMatchObject({ status: "ok", pulls: [{ number: 1 }, { number: 2 }] });
		expect(n.ensureDiscussion).toHaveBeenCalledTimes(2);
	});

	it("drops a check run that is not the verdict before loading or fetching anything", async () => {
		const { go, loadFeed, client } = setup();
		expect(await go(check({ name: "test:unit / Conclusion" }))).toEqual({
			status: "skipped",
			reason: "test:unit / Conclusion is not the verdict",
		});
		expect(loadFeed).not.toHaveBeenCalled();
		expect(client.repos.getRepo).not.toHaveBeenCalled();
		expect(client.pulls.getPullRequest).not.toHaveBeenCalled();
	});

	it("drops an aggregate that is not a verdict", async () => {
		const { go, loadFeed } = setup();
		for (const conclusion of ["neutral", "skipped", null]) {
			expect(await go(check({ conclusion }))).toMatchObject({
				status: "skipped",
				reason: expect.stringContaining("not a verdict"),
			});
		}
		expect(loadFeed).not.toHaveBeenCalled();
	});

	it("posts for the aggregate's verdict", async () => {
		const { go, n } = setup();
		expect(await go(check())).toMatchObject({ status: "ok", pulls: [{ posted: ["ci"] }] });
		expect(n.postDiscussionMessage).toHaveBeenCalledTimes(1);
	});

	it("is skipped when a check run belongs to no pull request (a fork's)", async () => {
		const { go, loadFeed } = setup();
		expect(await go({ ...(check() as Extract<PrFeedTrigger, { kind: "check_run" }>), numbers: [] })).toEqual({
			status: "skipped",
			reason: "no pull request to follow",
		});
		expect(loadFeed).not.toHaveBeenCalled();
	});

	it("fails, naming the pull request, when a step throws, and still tries the others", async () => {
		const { go, n } = setup();
		n.ensureDiscussion.mockRejectedValueOnce(new Error("Missing Access"));
		const result = await go(pr([1, 2]));
		expect(result).toEqual({ status: "fail", reason: "acme/widgets#1: Missing Access" });
		expect(n.ensureDiscussion).toHaveBeenCalledTimes(2);
	});

	it("fails rather than throws when loading or the repository read throws", async () => {
		const loadFails = setup();
		loadFails.loadFeed.mockRejectedValueOnce(new Error("boom"));
		expect(await loadFails.go(pr())).toEqual({ status: "fail", reason: "boom" });

		const repoFails = setup();
		repoFails.client.repos.getRepo.mockRejectedValueOnce(new Error("404"));
		expect(await repoFails.go(pr())).toEqual({ status: "fail", reason: "404" });
	});
});
