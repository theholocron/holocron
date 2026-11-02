import { describe, expect, it } from "vitest";

import { discussionTitle } from "./discussion-title.js";

describe("discussionTitle", () => {
	it("opens with 💡 New spec: or 📐 New ADR:", () => {
		expect(discussionTitle("spec", "Channel content")).toBe("💡 New spec: Channel content");
		expect(discussionTitle("adr", "Task manifest")).toBe("📐 New ADR: Task manifest");
	});

	it("keeps a title that fits in exactly 100 characters", () => {
		const title = "a".repeat(100 - "💡 New spec: ".length);

		expect(discussionTitle("spec", title)).toBe(`💡 New spec: ${title}`);
		expect(discussionTitle("spec", title)).toHaveLength(100);
	});

	it("cuts a longer one with an ellipsis so the whole is 100 characters", () => {
		const cut = discussionTitle("adr", "b".repeat(200));

		expect(cut).toHaveLength(100);
		expect(cut.startsWith("📐 New ADR: bbb")).toBe(true);
		expect(cut.endsWith("…")).toBe(true);
	});
});
