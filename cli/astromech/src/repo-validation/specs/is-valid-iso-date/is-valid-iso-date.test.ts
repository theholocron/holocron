import { describe, expect, it } from "vitest";

import { isValidIsoDate } from "./is-valid-iso-date.js";

describe("isValidIsoDate", () => {
	it("accepts a YYYY-MM-DD date", () => {
		expect(isValidIsoDate("2026-05-01")).toBe(true);
	});

	it("rejects other shapes and impossible months", () => {
		expect(isValidIsoDate("May 1")).toBe(false);
		expect(isValidIsoDate("2026-5-1")).toBe(false);
		expect(isValidIsoDate("2026-13-01")).toBe(false);
	});
});
