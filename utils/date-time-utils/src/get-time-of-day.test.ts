import { describe, test, expect } from "vitest";
import { getTimeOfDay } from "./index.ts";

describe("getTimeOfDay", () => {
	test("use current time when no date is provided", () => {
		const result = getTimeOfDay();
		expect(["morning", "afternoon", "evening"]).toContain(result);
	});

	test("return 'morning' for a valid morning date", () => {
		expect(getTimeOfDay(new Date("2024-11-18T08:30:00"))).toBe("morning");
	});

	test("return 'afternoon' for a valid afternoon date", () => {
		expect(getTimeOfDay(new Date("2024-11-18T14:00:00"))).toBe("afternoon");
	});

	test("return 'evening' for a valid evening date", () => {
		expect(getTimeOfDay(new Date("2024-11-18T19:45:00"))).toBe("evening");
	});

	test("fall back to current time for an invalid date", () => {
		const result = getTimeOfDay(new Date("invalid-date"));
		expect(["morning", "afternoon", "evening", "night"]).toContain(result);
	});
});
