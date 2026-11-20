import type { NotificationsLayout } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { BOT_NEEDS, botNeeds, replaceNeeds } from "./bot-needs.js";

const layoutOf = (value: unknown) => value as NotificationsLayout;

describe("botNeeds", () => {
	it("is the usual set for no layout or a plain one", () => {
		expect(botNeeds(undefined)).toEqual(BOT_NEEDS);
		expect(botNeeds(layoutOf({ categories: [{ name: "A", channels: [{ name: "x" }] }] }))).toEqual(BOT_NEEDS);
		expect(botNeeds(layoutOf({ categories: [{ name: "A" }] }))).toEqual(BOT_NEEDS);
	});

	it("adds Pin Messages, Manage Threads and Add Reactions when the layout asks for them", () => {
		const layout = layoutOf({
			pinned: [{ channel: "rules", file: "r.md" }],
			categories: [{ name: "A", channels: [{ name: "f", kind: "forum", starterReactions: ["x"] }] }],
		});
		expect(botNeeds(layout)).toEqual([...BOT_NEEDS, "PinMessages", "ManageThreads", "AddReactions"]);
	});

	it("adds only what the layout needs", () => {
		const forum = layoutOf({ categories: [{ name: "A", channels: [{ name: "f", kind: "forum" }] }] });
		expect(botNeeds(forum)).toEqual([...BOT_NEEDS, "ManageThreads"]);
		expect(botNeeds(layoutOf({ pinned: [] }))).toEqual(BOT_NEEDS);
	});

	it("asks for Create Guild Expressions only when the layout gives a server emoji an image", () => {
		const layout = (defaultReaction: unknown) =>
			layoutOf({ categories: [{ name: "A", channels: [{ name: "f", kind: "forum", defaultReaction }] }] });
		const withImage = { emoji: ":git_merge:", image: ".holocron/media/emoji/git_merge.png" };
		expect(botNeeds(layout(withImage))).toEqual([...BOT_NEEDS, "ManageThreads", "CreateGuildExpressions"]);
		for (const reaction of [":git_merge:", { emoji: ":git_merge:" }, "🔀"]) {
			expect(botNeeds(layout(reaction))).toEqual([...BOT_NEEDS, "ManageThreads"]);
		}
	});

	it("asks for Manage Guild Expressions on top only when emoji are replaced", () => {
		expect(botNeeds(undefined)).not.toContain("ManageGuildExpressions");
		expect(replaceNeeds(undefined)).toEqual([...BOT_NEEDS, "ManageGuildExpressions"]);
	});
});
