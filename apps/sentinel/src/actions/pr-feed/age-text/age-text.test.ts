import { describe, expect, it } from "vitest";

import { ageText } from "./age-text.js";

const NOW = new Date("2026-06-10T12:00:00Z");

describe("ageText", () => {
	it.each([
		["2026-06-10T11:59:30Z", "just now"],
		["2026-06-10T12:00:30Z", "just now"],
		["2026-06-10T11:59:00Z", "1 minute ago"],
		["2026-06-10T11:15:00Z", "45 minutes ago"],
		["2026-06-10T11:00:00Z", "1 hour ago"],
		["2026-06-10T00:00:00Z", "12 hours ago"],
		["2026-06-09T12:00:00Z", "1 day ago"],
		["2026-06-01T12:00:00Z", "9 days ago"],
	])("%s is %s", (createdAt, expected) => {
		expect(ageText(createdAt, NOW)).toBe(expected);
	});
});
