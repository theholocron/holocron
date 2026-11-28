import { describe, expect, it } from "vitest";

import { parseStates } from "./parse-states.js";

describe("parseStates", () => {
	it("trims, drops blanks and duplicates, and keeps the order", () => {
		expect(parseStates({ states: " a, b ,,a, in-progress ", fileState: "in-progress" })).toEqual({
			states: ["a", "b", "in-progress"],
			fileState: "in-progress",
		});
	});

	it("falls back to the defaults for an empty list and a blank filing state", () => {
		expect(parseStates({ states: " , ", fileState: " " })).toEqual({
			states: ["seed", "exploring", "in-progress", "dropped"],
			fileState: "in-progress",
		});
	});

	it("adds the filing state when the list leaves it out", () => {
		expect(parseStates({ states: "idea, later", fileState: "ready" })).toEqual({
			states: ["idea", "later", "ready"],
			fileState: "ready",
		});
	});
});
