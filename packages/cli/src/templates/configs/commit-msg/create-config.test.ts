import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("commit-msg createConfig", () => {
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

	it("lints the commit message via `holocron lint commit-msg` (holocron#789)", () => {
		expect(createConfig()).toContain('pnpm exec holocron lint commit-msg "$1"');
	});

	it("substitutes a custom holocron script", () => {
		expect(createConfig("node packages/cli/dist/cli.mjs")).toContain(
			'node packages/cli/dist/cli.mjs lint commit-msg "$1"'
		);
		expect(createConfig("node packages/cli/dist/cli.mjs")).not.toContain("__HOLOCRON_SCRIPT__");
	});

	it("no longer shells out to the commitlint binary directly", () => {
		const out = createConfig();
		expect(out).not.toContain("npx");
		expect(out).not.toContain("commitlint");
	});
});
