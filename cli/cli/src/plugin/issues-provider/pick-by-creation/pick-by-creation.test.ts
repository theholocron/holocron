import { describe, expect, it } from "vitest";

import { pickByCreation } from "./pick-by-creation.js";

const items = [
	{ id: "c", at: "2026-03-03T00:00:00Z" },
	{ id: "a", at: "2026-03-01T00:00:00Z" },
	{ id: "b1", at: "2026-03-02T00:00:00Z" },
	{ id: "b2", at: "2026-03-02T00:00:00Z" },
];
const at = (i: { at: string }) => i.at;

describe("pickByCreation", () => {
	it("keeps the first created, oldest first", () => {
		expect(pickByCreation(items, at, "oldest", 2).map((i) => i.id)).toEqual(["a", "b1"]);
	});

	it("keeps the last created, still oldest first", () => {
		expect(pickByCreation(items, at, "newest", 2).map((i) => i.id)).toEqual(["b2", "c"]);
	});

	it("returns everything, in order, when the limit is larger", () => {
		expect(pickByCreation(items, at, "newest", 10).map((i) => i.id)).toEqual(["a", "b1", "b2", "c"]);
		expect(pickByCreation(items, at, "oldest", 10)).toHaveLength(4);
	});
});
