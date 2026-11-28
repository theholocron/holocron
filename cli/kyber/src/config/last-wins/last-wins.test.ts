import { describe, expect, it } from "vitest";

import { lastWins } from "./last-wins.js";

describe("lastWins", () => {
	it("has no starting value and takes the next one", () => {
		const s = lastWins<string>();
		expect(s.empty).toBeUndefined();
		expect(s.merge("a", "b")).toBe("b");
	});
});
