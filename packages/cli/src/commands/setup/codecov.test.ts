import { describe, expect, it } from "vitest";

import { codecovContent, mergeCodecovComponents } from "./codecov.js";

describe("codecovContent", () => {
	it("includes standard coverage thresholds and comment layout", () => {
		const out = codecovContent([]);
		expect(out).toContain("require_ci_to_pass: true");
		expect(out).toContain("target: auto");
		expect(out).toContain("target: 80%");
		expect(out).toContain('layout: "reach,diff,flags,components"');
		expect(out).toContain("require_changes: true");
	});

	it("produces individual_components entry for each package using slug as name", () => {
		const out = codecovContent([
			{ slug: "http-client", name: "@theholocron/http-client" },
			{ slug: "clerk-client", name: "@theholocron/clerk-client" },
		]);
		expect(out).toContain("component_id: http-client");
		expect(out).toContain('name: "http-client"');
		expect(out).not.toContain("@theholocron/");
		expect(out).toContain("- packages/http-client/**");
		expect(out).toContain("component_id: clerk-client");
		expect(out).toContain('name: "clerk-client"');
		expect(out).toContain("- packages/clerk-client/**");
	});

	it("produces empty individual_components list when no packages are given", () => {
		const out = codecovContent([]);
		expect(out).toContain("individual_components:");
		expect(out).toContain("[]");
	});

	it("ends with a trailing newline", () => {
		expect(codecovContent([])).toMatch(/\n$/);
	});
});

describe("mergeCodecovComponents", () => {
	const existing = [
		"codecov:",
		"  require_ci_to_pass: true",
		"",
		"coverage:",
		'  range: "70...100"',
		"  status:",
		"    patch:",
		"      default:",
		"        threshold: 2%",
		"",
		"component_management:",
		"  default_rules:",
		"    statuses:",
		"      - type: patch",
		"        target: 80%",
		"  individual_components:",
		"    - component_id: old-pkg",
		'      name: "old-pkg"',
		"      paths:",
		"        - packages/old-pkg/**",
		"",
	].join("\n");

	it("replaces individual_components block while preserving the rest of the file", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "new-pkg", name: "@acme/new-pkg" }]);
		expect(out).toContain('range: "70...100"');
		expect(out).toContain("threshold: 2%");
		expect(out).toContain("component_id: new-pkg");
		expect(out).not.toContain("old-pkg");
	});

	it("uses slug as the component name, not the npm package name", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "foo", name: "@acme/foo" }]);
		expect(out).toContain('name: "foo"');
		expect(out).not.toContain("@acme/");
	});

	it("returns the file unchanged when individual_components marker is absent", () => {
		const noMarker = "codecov:\n  require_ci_to_pass: true\n";
		expect(mergeCodecovComponents(noMarker, [{ slug: "foo", name: "@acme/foo" }])).toBe(noMarker);
	});
});
