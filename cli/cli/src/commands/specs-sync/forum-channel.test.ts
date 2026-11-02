import { describe, expect, it } from "vitest";

import type { NotificationsLayout } from "../../plugin/index.js";
import { forumChannel } from "./forum-channel.js";

const layout = (...names: Array<[string, "text" | "forum"]>): NotificationsLayout => ({
	categories: [{ name: "BUILD", channels: names.map(([name, kind]) => ({ name, kind })) }],
});

describe("forumChannel", () => {
	it("is the only forum the layout declares", () => {
		expect(forumChannel(layout(["dev", "text"], ["ideas", "forum"]))).toEqual({ channel: "ideas" });
	});

	it("is the forum named, in any case, by the name the layout gives it", () => {
		const two = layout(["ideas", "forum"], ["specs", "forum"]);

		expect(forumChannel(two, "SPECS")).toEqual({ channel: "specs" });
	});

	it("says there is no such forum when the name is a text channel or unknown", () => {
		expect(forumChannel(layout(["dev", "text"]), "dev")).toEqual({
			problem: 'the layout declares no forum named `dev` -- add it with `kind: "forum"`',
		});
	});

	it("says so when the layout has no forum, and when it has several and none is named", () => {
		expect(forumChannel(layout(["dev", "text"]))).toEqual({
			problem: 'the layout declares no forum channel -- add one with `kind: "forum"`',
		});
		expect(forumChannel(layout(["ideas", "forum"], ["specs", "forum"]))).toEqual({
			problem: "the layout declares several forums (`ideas`, `specs`) -- pass --channel",
		});
	});

	it("copes with a layout that has no categories, or a category with no channels", () => {
		expect(forumChannel({})).toMatchObject({ problem: expect.stringContaining("no forum channel") });
		expect(forumChannel({ categories: [{ name: "A" }] })).toMatchObject({
			problem: expect.stringContaining("no forum channel"),
		});
	});
});
