import { describe, expect, it } from "vitest";

import { style } from "./style.js";

describe("style", () => {
	it.each([
		["success", "✓"],
		["warn", "⚠"],
		["fail", "✗"],
		["step", "→"],
		["skip", "·"],
	] as const)("%s marks the message with %s", (name, marker) => {
		const text = style[name]("the message");
		expect(text).toContain(marker);
		expect(text).toContain("the message");
	});

	it.each(["hint", "dim", "header"] as const)("%s keeps the message", (name) => {
		expect(style[name]("the message")).toContain("the message");
	});
});
