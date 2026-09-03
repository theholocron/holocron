import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("github-labeler createConfig", () => {
	it("includes the auto-generated header", () => {
		expect(createConfig()).toContain("AUTO-GENERATED — do not edit directly");
	});

	it("maps fix: prefix to bug label", () => {
		expect(createConfig()).toContain("bug:");
		expect(createConfig()).toContain("'^fix'");
	});

	it("maps feat: prefix to enhancement label", () => {
		expect(createConfig()).toContain("enhancement:");
		expect(createConfig()).toContain("'^feat'");
	});

	it("distinguishes chore from dependency updates", () => {
		const out = createConfig();
		expect(out).toContain("chore:");
		expect(out).toContain("dependencies:");
		expect(out).toContain("'^chore\\(deps'");
	});
});
