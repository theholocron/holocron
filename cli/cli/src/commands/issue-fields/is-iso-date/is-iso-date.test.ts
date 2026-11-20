import { describe, expect, it } from "vitest";

import { isIsoDate } from "./is-iso-date.js";

describe("isIsoDate", () => {
	it("accepts a real date", () => {
		expect(isIsoDate("2026-02-28")).toBe(true);
		expect(isIsoDate("2028-02-29")).toBe(true);
	});

	it("refuses another shape and a date that is not on the calendar", () => {
		for (const bad of ["2026-2-1", "26-02-01", "2026-02-30", "2026-13-01", "tomorrow", "2026-02-01T00:00", ""]) {
			expect(isIsoDate(bad)).toBe(false);
		}
	});
});
