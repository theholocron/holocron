import { describe, expect, it } from "vitest";

import { CANONICAL_LABELS, STALE_LABELS } from "./labels.js";

describe("CANONICAL_LABELS", () => {
	it("has no duplicate names", () => {
		const names = CANONICAL_LABELS.map((l) => l.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it("every entry has a name, 6-char hex color, and description", () => {
		for (const label of CANONICAL_LABELS) {
			expect(label.name).toBeTruthy();
			expect(label.color).toMatch(/^[0-9a-f]{6}$/i);
			expect(label.description).toBeTruthy();
		}
	});

	it("includes the standard GitHub label set", () => {
		const names = CANONICAL_LABELS.map((l) => l.name);
		expect(names).toContain("bug");
		expect(names).toContain("enhancement");
		expect(names).toContain("documentation");
		expect(names).toContain("duplicate");
		expect(names).toContain("wontfix");
	});
});

describe("STALE_LABELS", () => {
	it("is a non-empty array of strings", () => {
		expect(STALE_LABELS.length).toBeGreaterThan(0);
		for (const label of STALE_LABELS) {
			expect(typeof label).toBe("string");
		}
	});

	it("includes legacy GitHub Actions and autorelease labels", () => {
		expect(STALE_LABELS).toContain("github_actions");
		expect(STALE_LABELS).toContain("autorelease: pending");
		expect(STALE_LABELS).toContain("autorelease: tagged");
	});
});
