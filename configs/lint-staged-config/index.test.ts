import { describe, it, expect } from "vitest";
import config from "./index.js";

describe("lint-staged-config", () => {
	it("exports a non-empty config object", () => {
		expect(typeof config).toBe("object");
		expect(Object.keys(config).length).toBeGreaterThan(0);
	});

	it("every key is a glob pattern string", () => {
		for (const key of Object.keys(config)) {
			expect(typeof key).toBe("string");
			expect(key.length).toBeGreaterThan(0);
		}
	});

	it("every value is a command string or array of commands", () => {
		for (const value of Object.values(config)) {
			const isString = typeof value === "string";
			const isArray =
				Array.isArray(value) &&
				value.every((v) => typeof v === "string");
			expect(isString || isArray).toBe(true);
		}
	});
});
