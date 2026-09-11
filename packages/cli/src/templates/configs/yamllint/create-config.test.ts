import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("yamllint createConfig", () => {
	it("includes the auto-generated header", () => {
		expect(createConfig()).toContain("AUTO-GENERATED — do not edit directly");
	});

	it("ignores node_modules, dist, and pnpm-lock.yaml", () => {
		const out = createConfig();
		expect(out).toContain("node_modules/");
		expect(out).toContain("dist/");
		expect(out).toContain("pnpm-lock.yaml");
	});

	it("extends default ruleset", () => {
		expect(createConfig()).toContain("extends: default");
	});

	it("disables line-length rule", () => {
		expect(createConfig()).toContain("line-length: disable");
	});
});
