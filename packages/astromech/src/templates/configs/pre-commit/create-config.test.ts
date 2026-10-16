import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("pre-commit createConfig", () => {
	it("starts with the shebang on line 1", () => {
		expect(createConfig()).toMatch(/^#!/);
		expect(createConfig().split("\n")[0]).toBe("#!/bin/sh");
	});

	it("includes the auto-generated header after the shebang", () => {
		const out = createConfig();
		expect(out).toContain("AUTO-GENERATED — do not edit directly");
		const shebangLine = out.indexOf("#!/bin/sh");
		const headerLine = out.indexOf("# AUTO-GENERATED");
		expect(headerLine).toBeGreaterThan(shebangLine);
	});

	it("scopes GitLeaks to staged changes, not the whole history", () => {
		const out = createConfig();
		expect(out).toContain("gitleaks protect --staged --no-banner");
		// The explanatory comment names the old `gitleaks git` invocation for
		// context — assert the actual command line, not the un-invoked one.
		expect(out).not.toMatch(/^gitleaks git\b/m);
	});

	it("aborts the commit when GitLeaks finds a secret", () => {
		const out = createConfig();
		expect(out).toContain("Secrets detected by GitLeaks, aborting commit!");
		expect(out).toContain("exit 1");
	});

	it("runs lint-staged with the shared config", () => {
		expect(createConfig()).toContain("npx lint-staged --config @theholocron/lint-staged-config");
	});
});
