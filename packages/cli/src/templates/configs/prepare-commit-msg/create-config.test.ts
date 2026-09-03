import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("prepare-commit-msg createConfig", () => {
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

	it("validates git user.name and user.email", () => {
		const out = createConfig();
		expect(out).toContain("git config user.name");
		expect(out).toContain("git config user.email");
	});

	it("appends the DCO Signed-off-by trailer", () => {
		expect(createConfig()).toContain("Signed-off-by");
	});

	it("runs devmoji", () => {
		expect(createConfig()).toContain("devmoji");
	});
});
