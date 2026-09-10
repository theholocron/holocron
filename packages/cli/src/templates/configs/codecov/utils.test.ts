import { describe, expect, it } from "vitest";

import { ensureIfNotFound, mergeCodecovComponents } from "./utils.js";

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

	it("injects if_not_found into a pre-existing codecov.yml that lacks it", () => {
		const out = mergeCodecovComponents(existing, [{ slug: "new-pkg", name: "@acme/new-pkg" }]);
		// the component_management default status in the preserved prefix gains the key
		expect(out).toMatch(/- type: patch\n\s+target: 80%\n\s+if_not_found: success/);
	});
});

describe("ensureIfNotFound", () => {
	it("adds if_not_found: success after every status target", () => {
		const input = [
			"coverage:",
			"  status:",
			"    project:",
			"      default:",
			"        target: auto",
			"        threshold: 2%",
			"    patch:",
			"      default:",
			"        target: 80%",
			"",
		].join("\n");
		const out = ensureIfNotFound(input);
		expect(out).toMatch(/target: auto\n\s+if_not_found: success\n\s+threshold: 2%/);
		expect(out).toMatch(/target: 80%\n\s+if_not_found: success/);
	});

	it("is idempotent — does not double-insert when the key is already present", () => {
		const input = [
			"    project:",
			"      default:",
			"        target: auto",
			"        if_not_found: success",
			"",
		].join("\n");
		expect(ensureIfNotFound(input)).toBe(input);
	});

	it("leaves shallow (non-status) target keys untouched", () => {
		const input = ["thresholds:", "  target: 90", ""].join("\n");
		expect(ensureIfNotFound(input)).toBe(input);
	});

	it("handles a statuses list item (component_management default rule)", () => {
		const input = [
			"component_management:",
			"  default_rules:",
			"    statuses:",
			"      - type: patch",
			"        target: 80%",
			"",
		].join("\n");
		expect(ensureIfNotFound(input)).toMatch(/target: 80%\n\s+if_not_found: success/);
	});
});
