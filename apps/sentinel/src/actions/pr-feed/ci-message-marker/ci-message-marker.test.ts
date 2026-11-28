import { describe, expect, it } from "vitest";

import { ciMessageMarker } from "./ci-message-marker.js";

describe("ciMessageMarker", () => {
	it("is a small-print line with the sha and the conclusion", () => {
		expect(ciMessageMarker("abc1234def", "failure")).toBe("-# ci: abc1234def failure");
	});
});
