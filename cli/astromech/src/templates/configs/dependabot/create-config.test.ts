import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("dependabot createConfig", () => {
	it("includes the auto-generated header pointing at this generator", () => {
		const out = createConfig();
		expect(out).toContain("AUTO-GENERATED — do not edit directly");
		expect(out).toContain("cli/astromech/src/templates/configs/dependabot/create-config.ts");
	});

	it("configures weekly npm updates with conventional commit prefixes", () => {
		const out = createConfig();
		expect(out).toContain("version: 2");
		expect(out).toContain("package-ecosystem: npm");
		expect(out).toContain("interval: weekly");
		expect(out).toContain('prefix: "chore(deps)"');
	});
});
