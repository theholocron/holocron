import type { NotificationsLayout } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { prFeedChannel } from "./pr-feed-channel.js";

const layout = (channels: NonNullable<NotificationsLayout["categories"]>[number]["channels"]): NotificationsLayout => ({
	categories: [{ name: "Work" }, { name: "Dev", channels }],
});

describe("prFeedChannel", () => {
	it("is undefined without a layout, a category with channels or a feed", () => {
		expect(prFeedChannel(undefined)).toBeUndefined();
		expect(prFeedChannel({})).toBeUndefined();
		expect(prFeedChannel(layout([{ name: "prs", kind: "forum" }]))).toBeUndefined();
	});

	it("finds the forum with feeds.prs: true", () => {
		const found = prFeedChannel(
			layout([{ name: "general" }, { name: "prs", kind: "forum", feeds: { prs: true } }])
		);
		expect(found).toEqual({ name: "prs", excludeRepos: [], excludeAuthors: [] });
	});

	it("reads the exclusions of the object form", () => {
		const found = prFeedChannel(
			layout([{ name: "prs", kind: "forum", feeds: { prs: { exclude: { repos: ["a/b"], authors: ["bot"] } } } }])
		);
		expect(found).toEqual({ name: "prs", excludeRepos: ["a/b"], excludeAuthors: ["bot"] });
		const empty = prFeedChannel(layout([{ name: "prs", kind: "forum", feeds: { prs: {} } }]));
		expect(empty).toEqual({ name: "prs", excludeRepos: [], excludeAuthors: [] });
	});

	it("ignores a text channel that names the feed", () => {
		expect(prFeedChannel(layout([{ name: "prs", feeds: { prs: true } }]))).toBeUndefined();
	});
});
