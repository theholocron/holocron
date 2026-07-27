import { describe, expect, it } from "vitest";

import { createEnvLookup } from "../env.js";

describe("createEnvLookup", () => {
	describe("get()", () => {
		it("returns the value for an existing key", () => {
			const env = createEnvLookup({ MY_VAR: "hello" });
			expect(env.get("MY_VAR")).toBe("hello");
		});

		it("returns undefined for a missing key", () => {
			const env = createEnvLookup({});
			expect(env.get("MISSING")).toBeUndefined();
		});

		it("returns undefined for an empty-string value", () => {
			const env = createEnvLookup({ EMPTY: "" });
			expect(env.get("EMPTY")).toBeUndefined();
		});
	});

	describe("first()", () => {
		it("returns the first truthy value across keys", () => {
			const env = createEnvLookup({ A: "", B: "found", C: "also" });
			expect(env.first("A", "B", "C")).toBe("found");
		});

		it("returns undefined when all keys are missing or empty", () => {
			const env = createEnvLookup({ A: "", B: "" });
			expect(env.first("A", "B", "MISSING")).toBeUndefined();
		});

		it("returns the first key's value when it is set", () => {
			const env = createEnvLookup({ A: "first", B: "second" });
			expect(env.first("A", "B")).toBe("first");
		});
	});

	it("defaults to process.env when no source is provided", () => {
		const original = process.env["_TEST_SENTINEL"];
		process.env["_TEST_SENTINEL"] = "live";
		try {
			expect(createEnvLookup().get("_TEST_SENTINEL")).toBe("live");
		} finally {
			if (original === undefined) {
				delete process.env["_TEST_SENTINEL"];
			} else {
				process.env["_TEST_SENTINEL"] = original;
			}
		}
	});
});
