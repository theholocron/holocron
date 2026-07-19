import { describe, it, expect } from "vitest";
import config from "./jest-preset.js";

describe("jest-config (deprecated)", () => {
	it("exports a jest config object", () => {
		expect(typeof config).toBe("object");
		expect(config).not.toBeNull();
	});

	it("enables coverage collection", () => {
		expect(config.collectCoverage).toBe(true);
		expect(Array.isArray(config.collectCoverageFrom)).toBe(true);
	});

	it("has 80% coverage thresholds", () => {
		const t = config.coverageThreshold?.global;
		expect(t?.statements).toBe(80);
		expect(t?.branches).toBe(80);
		expect(t?.lines).toBe(80);
		expect(t?.functions).toBe(80);
	});
});
