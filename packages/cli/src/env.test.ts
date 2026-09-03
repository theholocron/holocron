import { describe, expect, it } from "vitest";

import { makeEnv } from "./env.js";

describe("makeEnv", () => {
	it("returns a string value for a present key", () => {
		const env = makeEnv({ MY_VAR: "hello" });
		expect(env.get("MY_VAR")).toBe("hello");
	});

	it("returns undefined for a missing key", () => {
		const env = makeEnv({});
		expect(env.get("MISSING")).toBeUndefined();
	});

	it("returns undefined for an empty string value", () => {
		const env = makeEnv({ EMPTY: "" });
		expect(env.get("EMPTY")).toBeUndefined();
	});

	it("does not coerce boolean-looking strings", () => {
		const env = makeEnv({ CI: "true", FLAG: "false" });
		expect(env.get("CI")).toBe("true");
		expect(env.get("FLAG")).toBe("false");
	});

	it("does not coerce numeric-looking strings", () => {
		const env = makeEnv({ PORT: "3000" });
		expect(env.get("PORT")).toBe("3000");
	});

	it("falls back to process.env when no source is provided", () => {
		const sentinel = `_TEST_SENTINEL_${Date.now()}`;
		process.env[sentinel] = "live";
		try {
			const env = makeEnv();
			expect(env.get(sentinel)).toBe("live");
		} finally {
			delete process.env[sentinel];
		}
	});
});
