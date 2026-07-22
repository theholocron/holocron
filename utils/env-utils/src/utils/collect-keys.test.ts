import { describe, expect, it } from "vitest";
import { collectKeys } from "./index.js";

describe("collectKeys", () => {
	it("returns empty array for empty object", () => {
		expect(collectKeys({})).toEqual([]);
	});

	it("returns flat keys for a flat object", () => {
		expect(collectKeys({ a: "1", b: "2", c: "3" })).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("returns dot-path keys for a nested object", () => {
		expect(collectKeys({ a: { b: "1" } })).toEqual(["a.b"]);
	});

	it("handles multiple levels of nesting", () => {
		expect(collectKeys({ a: { b: { c: "1" } } })).toEqual(["a.b.c"]);
	});

	it("handles mixed flat and nested keys", () => {
		expect(collectKeys({ a: "1", b: { c: "2", d: "3" } })).toEqual([
			"a",
			"b.c",
			"b.d",
		]);
	});

	it("handles multiple nested branches", () => {
		expect(collectKeys({ a: { b: "1" }, c: { d: "2" } })).toEqual([
			"a.b",
			"c.d",
		]);
	});

	it("respects a custom prefix", () => {
		expect(collectKeys({ a: "1", b: { c: "2" } }, "root")).toEqual([
			"root.a",
			"root.b.c",
		]);
	});
});
