import { describe, expect, it } from "vitest";

import type { NotificationsLayout } from "../../../plugin/index.js";
import { layoutEmojis } from "../layout-emojis/index.js";
import { tagEmojiProblem } from "./tag-emoji-problem.js";

const tagged = (...emojis: Array<string | undefined>): NotificationsLayout =>
	({
		categories: [
			{
				name: "A",
				channels: [
					{
						name: "prs",
						kind: "forum",
						defaultReaction: { emoji: ":git_pull_request:", image: ".holocron/media/a.png" },
						tags: emojis.map((emoji, i) => ({ name: `t${i}`, ...(emoji ? { emoji } : {}) })),
					},
				],
			},
		],
	}) as NotificationsLayout;

describe("a forum tag's emoji", () => {
	it("counts a server emoji a tag names, once, and not a Unicode one or no emoji", () => {
		expect(layoutEmojis(tagged(":git_merge:", "❌", undefined, ":git_merge:", "git_branch"))).toEqual([
			{ name: "git_pull_request", image: ".holocron/media/a.png" },
			{ name: "git_merge" },
		]);
	});

	it("takes a picture from another use of the emoji a tag names", () => {
		expect(layoutEmojis(tagged(":git_pull_request:"))).toEqual([
			{ name: "git_pull_request", image: ".holocron/media/a.png" },
		]);
	});

	it("leaves Unicode, a bare word and no emoji alone", () => {
		const none = new Set<string>();
		expect(tagEmojiProblem("draft", undefined, none)).toBeUndefined();
		expect(tagEmojiProblem("draft", "✏️", none)).toBeUndefined();
		expect(tagEmojiProblem("draft", "git_merge", none)).toBeUndefined();
	});

	it("refuses a malformed :name: and a server emoji with no picture, by name", () => {
		const pictured = new Set(["git_merge"]);
		expect(tagEmojiProblem("merged", ":git_merge:", pictured)).toBeUndefined();
		expect(tagEmojiProblem("merged", ":git merge:", pictured)).toMatch(
			/tag `merged` emoji: `:git merge:` is not an emoji/
		);
		expect(tagEmojiProblem("merged", ":git_merge", pictured)).toMatch(/is not an emoji/);
		expect(tagEmojiProblem("merged", ":git_branch:", pictured)).toBe(
			"tag `merged` emoji `:git_branch:` has no picture: give the emoji an `image` in `emojis` or a reaction so `setup` can make it"
		);
	});
});
