import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("pre-push createConfig", () => {
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

	it("runs `holocron ci` via the default script", () => {
		expect(createConfig()).toContain("pnpm exec holocron ci");
	});

	it("substitutes a custom holocron script", () => {
		expect(createConfig("node packages/cli/dist/cli.mjs")).toContain("node packages/cli/dist/cli.mjs ci");
		expect(createConfig("node packages/cli/dist/cli.mjs")).not.toContain("__HOLOCRON_SCRIPT__");
	});

	it("documents the --no-verify bypass", () => {
		expect(createConfig()).toContain("git push --no-verify");
	});

	it("no-ops in CI (before invoking holocron)", () => {
		const out = createConfig();
		expect(out).toContain('[ -n "$CI" ] && exit 0');
		expect(out.indexOf('"$CI"')).toBeLessThan(out.indexOf("holocron ci"));
	});
});
