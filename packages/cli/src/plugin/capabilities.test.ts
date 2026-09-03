import { describe, expect, it } from "vitest";

import { CARDINALITY, isMulti, REQUIRED_CAPABILITIES } from "./capabilities.js";

describe("CARDINALITY", () => {
	it("marks single-provider capabilities as single", () => {
		const singles = ["source", "ci", "secrets", "environments", "issues", "deployment", "storage", "auth", "vault", "dns", "wiki", "workers"] as const;
		for (const key of singles) {
			expect(CARDINALITY[key]).toBe("single");
		}
	});

	it("marks multi-provider capabilities as many", () => {
		const multis = ["tooling", "notifications", "analytics", "observability"] as const;
		for (const key of multis) {
			expect(CARDINALITY[key]).toBe("many");
		}
	});

	it("covers every capability key", () => {
		expect(Object.keys(CARDINALITY)).toHaveLength(16);
	});
});

describe("REQUIRED_CAPABILITIES", () => {
	it("is empty — no capability is strictly required", () => {
		expect(REQUIRED_CAPABILITIES).toHaveLength(0);
	});
});

describe("isMulti", () => {
	it("returns false for single-cardinality capabilities", () => {
		expect(isMulti("source")).toBe(false);
		expect(isMulti("vault")).toBe(false);
		expect(isMulti("wiki")).toBe(false);
	});

	it("returns true for many-cardinality capabilities", () => {
		expect(isMulti("tooling")).toBe(true);
		expect(isMulti("notifications")).toBe(true);
		expect(isMulti("analytics")).toBe(true);
		expect(isMulti("observability")).toBe(true);
	});
});
