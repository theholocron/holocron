import { describe, expect, it } from "vitest";

import { colorOf } from "./setup.js";

describe("colorOf", () => {
	it("uses GitHub's stock label colour when the name is a canonical label", () => {
		expect(colorOf("bug", [{ name: "Bug", color: "blue" }])).toBe("#d73a4a");
	});

	it("falls back to the declared Type's colour for epic, which is no longer a stock label", () => {
		expect(colorOf("epic", [{ name: "Epic", color: "purple" }])).toBe("#8250df");
		expect(colorOf("Epic")).toBeUndefined();
	});

	it("matches a Type by its declared label before its name", () => {
		expect(colorOf("big-work", [{ name: "Epic", label: "big-work", color: "orange" }])).toBe("#bc4c00");
	});

	it("has no colour for a name nothing declares, or a Type with no colour", () => {
		expect(colorOf("nothing", [])).toBeUndefined();
		expect(colorOf("epic", [{ name: "Epic" }])).toBeUndefined();
	});
});
