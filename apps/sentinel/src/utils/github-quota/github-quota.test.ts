import { afterEach, describe, expect, it } from "vitest";

import { currentQuota, QUOTA_RESERVE, quotaIsLow, recordQuota, resetQuota } from "./github-quota.js";

const NOW = 1_000_000_000_000;
const RESET = NOW / 1000 + 600;

afterEach(resetQuota);

describe("github quota", () => {
	it("knows nothing before a call reports it, so nothing is low", () => {
		expect(currentQuota(NOW)).toBeUndefined();
		expect(quotaIsLow(NOW)).toBe(false);
	});

	it("is low below the reserve and not at it", () => {
		recordQuota(QUOTA_RESERVE, RESET);
		expect(quotaIsLow(NOW)).toBe(false);
		recordQuota(QUOTA_RESERVE - 1, RESET);
		expect(quotaIsLow(NOW)).toBe(true);
		expect(currentQuota(NOW)).toEqual({ remaining: QUOTA_RESERVE - 1, reset: RESET });
	});

	it("forgets a reading once its window has reset", () => {
		recordQuota(0, RESET);
		expect(quotaIsLow(NOW)).toBe(true);
		expect(quotaIsLow(RESET * 1000)).toBe(false);
		expect(currentQuota(RESET * 1000)).toBeUndefined();
	});

	it("ignores a response without the quota headers", () => {
		recordQuota(10, RESET);
		recordQuota(undefined, undefined);
		recordQuota(Number.NaN, RESET);
		recordQuota(10, Number.NaN);
		expect(currentQuota(NOW)?.remaining).toBe(10);
	});

	it("uses the clock when none is given", () => {
		recordQuota(0, Date.now() / 1000 + 600);
		expect(quotaIsLow()).toBe(true);
		expect(currentQuota()?.remaining).toBe(0);
	});
});
