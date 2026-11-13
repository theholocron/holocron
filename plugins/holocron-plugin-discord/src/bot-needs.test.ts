import type { NotificationsLayout } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { BOT_NEEDS, botNeeds } from "./bot-needs.js";

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
});
