import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("dco createConfig", () => {
	it("includes the auto-generated header pointing at this generator", () => {
		const out = createConfig();
		expect(out).toContain("AUTO-GENERATED — do not edit directly");
		expect(out).toContain("cli/astromech/src/templates/configs/dco/create-config.ts");
	});

	it("allows an individual to remediate a missing sign-off with a commit", () => {
		expect(createConfig()).toContain("allowRemediationCommits:\n  individual: true");
	});
});
