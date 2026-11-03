import { describe, expect, it } from "vitest";

import { discussionTitle } from "./discussion-title.js";

describe("discussionTitle", () => {
	it("is the document's own title, with nothing in front of it", () => {
		expect(discussionTitle("Channel content")).toBe("Channel content");
	});

	it("keeps a title of exactly 100 characters", () => {
		const title = "a".repeat(100);

		expect(discussionTitle(title)).toBe(title);
	});

	it("cuts a longer one with an ellipsis so the whole is 100 characters", () => {
		const cut = discussionTitle("b".repeat(200));

		expect(cut).toHaveLength(100);
		expect(cut.startsWith("bbb")).toBe(true);
		expect(cut.endsWith("…")).toBe(true);
	});
});
