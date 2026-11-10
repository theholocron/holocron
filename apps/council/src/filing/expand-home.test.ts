import { describe, expect, it } from "vitest";

import { expandHome } from "./expand-home.js";

describe("expandHome", () => {
	it("expands ~ alone and ~/path", () => {
		expect(expandHome("~", "/Users/me")).toBe("/Users/me");
		expect(expandHome("~/Code/holocron", "/Users/me")).toBe("/Users/me/Code/holocron");
		expect(expandHome("~/", "/Users/me")).toBe("/Users/me/");
	});

	it("handles a home with a trailing slash, and a home that is the root", () => {
		expect(expandHome("~/x", "/Users/me/")).toBe("/Users/me/x");
		expect(expandHome("~", "/Users/me/")).toBe("/Users/me");
		expect(expandHome("~", "/")).toBe("/");
		expect(expandHome("~/x", "/")).toBe("/x");
	});

	it("leaves ~user, absolute, relative and empty values alone", () => {
		expect(expandHome("~other/x", "/Users/me")).toBe("~other/x");
		expect(expandHome("/abs/~/x", "/Users/me")).toBe("/abs/~/x");
		expect(expandHome("pnpm", "/Users/me")).toBe("pnpm");
		expect(expandHome("", "/Users/me")).toBe("");
	});
});
