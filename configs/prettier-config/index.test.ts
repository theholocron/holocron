import { describe, it, expect } from "vitest";
import config from "./index.js";

describe("prettier-config", () => {
	it("exports a non-empty config object", () => {
		expect(typeof config).toBe("object");
		expect(Object.keys(config).length).toBeGreaterThan(0);
	});

	it("has numeric printWidth and tabWidth", () => {
		expect(typeof config.printWidth).toBe("number");
		expect(typeof config.tabWidth).toBe("number");
	});

	it("has boolean semi, singleQuote, useTabs", () => {
		expect(typeof config.semi).toBe("boolean");
		expect(typeof config.singleQuote).toBe("boolean");
		expect(typeof config.useTabs).toBe("boolean");
	});

	it("has overrides array", () => {
		expect(Array.isArray(config.overrides)).toBe(true);
		expect(config.overrides!.length).toBeGreaterThan(0);
	});
});
