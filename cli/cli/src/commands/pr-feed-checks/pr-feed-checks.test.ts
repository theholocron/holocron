import { describe, expect, it } from "vitest";

import type { NotificationsLayout, ServerInspection } from "../../plugin/index.js";
import { PR_FEED_TAGS } from "../notifications-setup/index.js";
import { prFeedChecks } from "./pr-feed-checks.js";

const layout = (feed: unknown = true): NotificationsLayout => ({
	categories: [
		{ name: "BUILD", channels: [{ name: "prs", kind: "forum", feeds: { prs: feed as never } }, { name: "dev" }] },
	],
});
const channel = (over: Partial<ServerInspection["channels"][number]> = {}): ServerInspection["channels"][number] => ({
	name: "prs",
	category: "BUILD",
	kind: "forum",
	tags: PR_FEED_TAGS.map((name) => ({ name })),
	webhooks: [],
	botThreads: { post: true, manage: true },
	...over,
});
const server = (over: Partial<ServerInspection["channels"][number]> = {}): ServerInspection => ({
	categories: ["BUILD"],
	channels: [channel(over)],
	roles: [],
});
const byId = (rows: ReturnType<typeof prFeedChecks>, id: string) => rows.find((r) => r.id === id)!;

describe("prFeedChecks", () => {
	it("adds no rows when no channel has feeds.prs", () => {
		expect(
			prFeedChecks({ layout: { categories: [{ name: "BUILD", channels: [{ name: "dev" }] }] }, found: server() })
		).toEqual([]);
		expect(prFeedChecks({ layout: {}, found: server() })).toEqual([]);
		expect(prFeedChecks({ layout: { categories: [{ name: "BUILD" }] }, found: server() })).toEqual([]);
		expect(prFeedChecks({ layout: layout(false), found: server() })).toEqual([]);
	});

	it("passes all three rows when the forum, its tags and the bot's permissions are right", () => {
		const rows = prFeedChecks({ layout: layout(), found: server() });
		expect(rows.map((r) => [r.id, r.status, r.detail])).toEqual([
			["pr-feed-forum", "pass", "1 of 1 as declared"],
			["pr-feed-tags", "pass", "1 of 1 as declared"],
			["pr-feed-bot", "pass", "1 of 1 as declared"],
		]);
	});

	it("matches the forum, its category and the tags without regard to case", () => {
		const found = server({
			name: "PRS",
			category: "build",
			tags: PR_FEED_TAGS.map((name) => ({ name: name.toUpperCase() })),
		});
		expect(prFeedChecks({ layout: layout({ exclude: { repos: ["a/b"] } }), found }).map((r) => r.status)).toEqual([
			"pass",
			"pass",
			"pass",
		]);
	});

	it("skips every row when the server could not be read", () => {
		const rows = prFeedChecks({ layout: layout(), found: undefined });
		expect(rows.map((r) => [r.id, r.status])).toEqual([
			["pr-feed-forum", "skip"],
			["pr-feed-tags", "skip"],
			["pr-feed-bot", "skip"],
		]);
		expect(rows[0]?.detail).toMatch(/could not read the server/);
	});

	it("fails the forum row when the forum is missing or sits under another category", () => {
		const gone = prFeedChecks({ layout: layout(), found: { categories: [], channels: [], roles: [] } });
		expect(byId(gone, "pr-feed-forum")).toMatchObject({ status: "fail", problems: ["#prs: missing from BUILD"] });
		const moved = prFeedChecks({ layout: layout(), found: server({ category: "OTHER" }) });
		expect(byId(moved, "pr-feed-forum").problems).toEqual(["#prs: missing from BUILD"]);
		const uncategorised = prFeedChecks({ layout: layout(), found: server({ category: undefined }) });
		expect(byId(uncategorised, "pr-feed-forum").status).toBe("fail");
	});

	it("fails the forum row when the channel is a text channel", () => {
		const { kind: _kind, tags: _tags, ...text } = channel();
		const rows = prFeedChecks({ layout: layout(), found: { categories: ["BUILD"], channels: [text], roles: [] } });
		expect(byId(rows, "pr-feed-forum").problems[0]).toMatch(/is a text channel, not a forum/);
		expect(byId(rows, "pr-feed-tags").status).toBe("pass");
	});

	it("fails the tags row naming each missing tag, including a forum with no tag list", () => {
		const some = prFeedChecks({
			layout: layout(),
			found: server({ tags: [{ name: "draft" }, { name: "ready" }] }),
		});
		expect(byId(some, "pr-feed-tags").problems).toEqual(
			PR_FEED_TAGS.filter((t) => t !== "draft" && t !== "ready").map((t) => `#prs: tag "${t}" is missing`)
		);
		const none = prFeedChecks({ layout: layout(), found: server({ tags: undefined }) });
		expect(byId(none, "pr-feed-tags").problems).toHaveLength(PR_FEED_TAGS.length);
	});

	it("fails the bot row for each permission it lacks", () => {
		const post = prFeedChecks({ layout: layout(), found: server({ botThreads: { post: false, manage: true } }) });
		expect(byId(post, "pr-feed-bot").problems).toEqual(["#prs: the bot cannot start posts or reply in it"]);
		const manage = prFeedChecks({ layout: layout(), found: server({ botThreads: { post: true, manage: false } }) });
		expect(byId(manage, "pr-feed-bot").problems).toEqual([
			"#prs: the bot cannot manage threads in it (Manage Threads)",
		]);
		const neither = prFeedChecks({
			layout: layout(),
			found: server({ botThreads: { post: false, manage: false } }),
		});
		expect(byId(neither, "pr-feed-bot").problems).toHaveLength(2);
	});

	it("fails the bot row when the permissions could not be read or the provider did not report them", () => {
		const failed = prFeedChecks({
			layout: layout(),
			found: server({ botThreads: undefined, botThreadsError: "403 Missing Access" }),
		});
		expect(byId(failed, "pr-feed-bot").problems[0]).toMatch(
			/could not read the bot's permissions \(403 Missing Access\)/
		);
		const silent = prFeedChecks({ layout: layout(), found: server({ botThreads: undefined }) });
		expect(byId(silent, "pr-feed-bot").problems[0]).toMatch(/did not report the bot's permissions/);
	});
});
