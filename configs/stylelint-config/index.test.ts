import { describe, it, expect } from "vitest";
import config from "./index.js";

describe("stylelint-config", () => {
	it("exports a config object with extends", () => {
		expect(typeof config).toBe("object");
		expect(Array.isArray(config.extends)).toBe(true);
		expect(config.extends.length).toBeGreaterThan(0);
	});

	it("extends stylelint-config-standard", () => {
		expect(config.extends).toContain("stylelint-config-standard");
	});

	it("extends stylelint-config-standard-scss", () => {
		expect(config.extends).toContain("stylelint-config-standard-scss");
	});
});
