import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("labeler createConfig", () => {
	it("includes the auto-generated header pointing at this generator", () => {
		const out = createConfig();
		expect(out).toContain("AUTO-GENERATED — do not edit directly");
		expect(out).toContain("cli/astromech/src/templates/configs/labeler/create-config.ts");
	});

	it("maps conventional-commit types to labels", () => {
		const out = createConfig();
		expect(out).toContain("bug:");
		expect(out).toContain('- "^fix"');
		expect(out).toContain("dependencies:");
	});
});
