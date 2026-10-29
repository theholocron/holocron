import { describe, expect, it } from "vitest";

import { createEnvLookup } from "./create-env-lookup.js";

describe("createEnvLookup", () => {
	describe("with a fixed source", () => {
		it("returns a string value for a present key", () => {
			const env = createEnvLookup({ MY_VAR: "hello" });
			expect(env.get("MY_VAR")).toBe("hello");
		});

		it("returns undefined for a missing key", () => {
			const env = createEnvLookup({});
			expect(env.get("MISSING")).toBeUndefined();
		});

		it("returns undefined for an empty string value", () => {
			const env = createEnvLookup({ EMPTY: "" });
			expect(env.get("EMPTY")).toBeUndefined();
		});

		it("does not coerce boolean-looking strings", () => {
			const env = createEnvLookup({ CI: "true", FLAG: "false" });
			expect(env.get("CI")).toBe("true");
			expect(env.get("FLAG")).toBe("false");
		});

		it("does not coerce numeric-looking strings", () => {
			const env = createEnvLookup({ PORT: "3000" });
			expect(env.get("PORT")).toBe("3000");
		});
	});

	describe("without a source (lazy process.env)", () => {
		it("reads from process.env on each call", () => {
			const sentinel = `_TEST_SENTINEL_${Date.now()}`;
			process.env[sentinel] = "live";
			try {
				const env = createEnvLookup();
				expect(env.get(sentinel)).toBe("live");
			} finally {
				delete process.env[sentinel];
			}
		});

		it("reflects process.env mutations after creation", () => {
			const key = `_TEST_MUTATION_${Date.now()}`;
			const env = createEnvLookup();
			expect(env.get(key)).toBeUndefined();
			process.env[key] = "added-later";
			try {
				expect(env.get(key)).toBe("added-later");
			} finally {
				delete process.env[key];
			}
		});

		it("returns undefined for an absent key", () => {
			const env = createEnvLookup();
			expect(env.get("__DEFINITELY_NOT_SET__")).toBeUndefined();
		});
	});
});
