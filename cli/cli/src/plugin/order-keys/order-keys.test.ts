import { describe, expect, it } from "vitest";

import { orderKeys } from "./order-keys.js";

describe("orderKeys", () => {
	it("sorts by the trailing number, oldest first", () => {
		expect(orderKeys(["#10", "#2", "#33"], "oldest")).toEqual(["#2", "#10", "#33"]);
	});

	it("sorts newest first, and reads a team prefix", () => {
		expect(orderKeys(["ENG-10", "ENG-2", "ENG-33"], "newest")).toEqual(["ENG-33", "ENG-10", "ENG-2"]);
	});

	it("keeps the listed order of keys with the same number", () => {
		expect(orderKeys(["a#1", "b#1"], "newest")).toEqual(["a#1", "b#1"]);
	});

	it("rejects a key with no number", () => {
		expect(() => orderKeys(["#1", "later"], "oldest")).toThrow(/Cannot order "later"/);
	});
});
