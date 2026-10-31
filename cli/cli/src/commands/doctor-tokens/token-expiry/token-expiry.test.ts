import { describe, expect, it } from "vitest";

import { describeExpiry, TOKEN_EXPIRY_WARN_DAYS } from "./token-expiry.js";

const now = new Date("2026-11-01T00:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

describe("describeExpiry", () => {
	it("warns at a week", () => {
		expect(TOKEN_EXPIRY_WARN_DAYS).toBe(7);
	});

	it.each([
		[12 * 24, "expires in 12 days", false],
		[7 * 24 + 1, "expires in 7 days", false],
		[7 * 24, "expires in 7 days", true],
		[3 * 24, "expires in 3 days", true],
		[24, "expires in 1 day", true],
		[5, "expires in less than a day", true],
		[0, "expired", true],
		[-30, "expired", true],
	])("%s hours left", (hours, text, soon) => {
		expect(describeExpiry(inHours(hours), now)).toEqual({ text, soon });
	});

	it("gives nothing for a time it cannot read", () => {
		expect(describeExpiry("later", now)).toBeUndefined();
	});
});
