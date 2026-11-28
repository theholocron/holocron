import { describe, expect, it } from "vitest";

import { DEFAULT_TOKEN_ROTATION, tokenRotationRows } from "./token-rotation.js";

const now = new Date("2026-11-13T12:00:00Z");
const policy = { maxAgeDays: 90, warnDays: 14 };
const rows = (l: Parameters<typeof tokenRotationRows>[0]) => tokenRotationRows(l, policy, now);

describe("tokenRotationRows", () => {
	it("defaults to 90 days with a 14 day warning", () => {
		expect(DEFAULT_TOKEN_ROTATION).toEqual(policy);
	});

	it("says honestly that nothing is exposed when there is no lifetime", () => {
		const [row, ...rest] = rows(undefined);
		expect(row).toMatchObject({ status: "info", label: "rotation" });
		expect(row?.detail).toContain("every 90 days");
		expect(rest).toEqual([]);
	});

	it("passes a token that expires later and is young", () => {
		expect(rows({ expiresAt: "2027-03-01T00:00:00Z", createdAt: "2026-10-13T12:00:00Z" })).toEqual([
			{ status: "ok", label: "expiry", detail: "expires on 2027-03-01 (107 days left)" },
			{ status: "ok", label: "age", detail: "31 days old since 2026-10-13 (rotate after 90)" },
		]);
	});

	it("fails an expired token", () => {
		expect(rows({ expiresAt: "2026-11-01T00:00:00Z" })[0]).toEqual({
			status: "fail",
			label: "expiry",
			detail: "expired on 2026-11-01",
		});
	});

	it("fails a token that expires inside the warning window", () => {
		const [row] = rows({ expiresAt: "2026-11-20T00:00:00Z" });
		expect(row).toMatchObject({ status: "fail", label: "expiry" });
		expect(row?.detail).toContain("6 days left");
	});

	it("fails a token older than the allowed age", () => {
		const row = rows({ createdAt: "2026-06-01T00:00:00Z" })[1];
		expect(row).toMatchObject({ status: "fail", label: "age" });
		expect(row?.detail).toContain("over the 90 days allowed");
	});

	it("reports a token with no expiry and no creation date as facts", () => {
		expect(rows({})).toEqual([
			{ status: "info", label: "expiry", detail: "the token has no expiry" },
			{ status: "info", label: "age", detail: "the provider does not say when the token was made" },
		]);
	});

	it("never passes a date it cannot read", () => {
		expect(rows({ expiresAt: "soon", createdAt: "long ago" })).toEqual([
			{ status: "info", label: "expiry", detail: "the provider's expiry date could not be read" },
			{ status: "info", label: "age", detail: "the provider's creation date could not be read" },
		]);
	});
});
