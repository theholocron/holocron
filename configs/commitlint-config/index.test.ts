import { describe, it, expect } from "vitest";
import config from "./index.js";

describe("commitlint-config", () => {
	it("extends @commitlint/config-conventional", () => {
		expect(Array.isArray(config.extends)).toBe(true);
		expect(config.extends).toContain("@commitlint/config-conventional");
	});

	it("has an ignores function for bump commits", () => {
		expect(Array.isArray(config.ignores)).toBe(true);
		expect(config.ignores?.length).toBeGreaterThan(0);
		expect(typeof config.ignores?.[0]).toBe("function");
		expect(config.ignores?.[0]?.("chore(deps): Bump foo from 1 to 2")).toBe(true);
		expect(config.ignores?.[0]?.("feat: add new thing")).toBe(false);
	});

	it("exports rules object", () => {
		expect(typeof config.rules).toBe("object");
	});
});
