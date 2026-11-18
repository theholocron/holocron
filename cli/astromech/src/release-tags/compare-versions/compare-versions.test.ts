import { describe, expect, it } from "vitest";

import { compareVersions, parseVersion } from "./compare-versions.js";

describe("compareVersions", () => {
	it("orders the three numbers numerically", () => {
		expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
		expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
		expect(compareVersions("2.0.0", "10.0.0")).toBeLessThan(0);
	});

	it("puts a prerelease before its release", () => {
		expect(compareVersions("1.0.0-alpha.1", "1.0.0")).toBeLessThan(0);
		expect(compareVersions("1.0.0", "1.0.0-alpha.1")).toBeGreaterThan(0);
	});

	it("orders prerelease numbers numerically", () => {
		expect(compareVersions("5.0.0-alpha.470", "5.0.0-alpha.99")).toBeGreaterThan(0);
	});

	it("orders identifiers: numbers below words, shorter first", () => {
		expect(compareVersions("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
		expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
		expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBeLessThan(0);
	});

	it("ignores build metadata", () => {
		expect(compareVersions("1.0.0+a", "1.0.0+b")).toBe(0);
	});

	it("throws for something that is not a version", () => {
		expect(() => compareVersions("nope", "1.0.0")).toThrow(TypeError);
		expect(parseVersion("1.0")).toBeUndefined();
	});
});
