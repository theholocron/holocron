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

	it("labels every pull request `dependencies` only, so Dependabot adds no ecosystem label (#1967)", () => {
		const out = createConfig();
		expect(out.match(/ {4}labels:\n {6}- dependencies\n/g)).toHaveLength(2);
		expect(out).not.toMatch(/javascript|github_actions/);
		const npm = out.slice(out.indexOf("package-ecosystem: npm"), out.indexOf("package-ecosystem: github-actions"));
		const actions = out.slice(out.indexOf("package-ecosystem: github-actions"));
		expect(npm).toContain("labels:");
		expect(actions).toContain("labels:");
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

	it("watches the sources next to .github/workflows in the github-actions entry only", () => {
		const out = createConfig({ sources: ["/ci/workflows", "/ci/actions/*", "/ci/workflows"] });
		const split = out.indexOf("package-ecosystem: github-actions");
		expect(out.slice(split)).toContain(
			"    directories:\n      - /\n      - /ci/workflows\n      - /ci/actions/*\n"
		);
		expect(out.slice(split)).not.toContain("    directory: /");
		expect(out.slice(0, split)).toContain("    directory: /");
		expect(out.match(/- \/ci\/workflows\n/g)).toHaveLength(1);
	});

	it("leaves the single directory alone with no sources", () => {
		expect(createConfig({ sources: [] })).toBe(createConfig());
		expect(createConfig()).not.toContain("directories:");
	});
});
