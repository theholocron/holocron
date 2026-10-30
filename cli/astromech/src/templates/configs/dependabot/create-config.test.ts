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

	it("ignores nothing unless asked to", () => {
		expect(createConfig()).not.toContain("ignore:");
		expect(createConfig({})).not.toContain("ignore:");
		expect(createConfig({ ignore: [] })).toBe(createConfig());
	});

	it("ignores each named package on the npm ecosystem, sorted and without repeats", () => {
		const out = createConfig({ ignore: ["@x/b-client", "@x/a-client", "@x/b-client"] });
		expect(out).toContain(
			[
				"    ignore:",
				'      - dependency-name: "@x/a-client"',
				'      - dependency-name: "@x/b-client"',
				"    groups:",
			].join("\n")
		);
		expect(out.match(/dependency-name/g)).toHaveLength(2);
	});

	it("puts the ignore entries in the npm entry, not the github-actions one", () => {
		const out = createConfig({ ignore: ["@x/a-client"] });
		expect(out.indexOf("ignore:")).toBeGreaterThan(out.indexOf("package-ecosystem: npm"));
		expect(out.indexOf("ignore:")).toBeLessThan(out.indexOf("package-ecosystem: github-actions"));
	});

	it("ignores by name only, so security updates are still raised", () => {
		const out = createConfig({ ignore: ["@x/a-client"] });
		expect(out).not.toContain("versions:");
	});
});
