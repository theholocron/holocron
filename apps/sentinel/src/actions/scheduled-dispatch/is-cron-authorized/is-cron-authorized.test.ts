import { describe, expect, it } from "vitest";

import { isCronAuthorized } from "./is-cron-authorized.js";

describe("isCronAuthorized", () => {
	it("accepts the bearer secret", () => {
		expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
	});

	it("refuses a wrong secret, a prefix of it and one with extra text", () => {
		expect(isCronAuthorized("Bearer other", "s3cret")).toBe(false);
		expect(isCronAuthorized("Bearer s3c", "s3cret")).toBe(false);
		expect(isCronAuthorized("Bearer s3cret!", "s3cret")).toBe(false);
	});

	it("refuses a missing header, another scheme and an empty secret", () => {
		expect(isCronAuthorized(null, "s3cret")).toBe(false);
		expect(isCronAuthorized("s3cret", "s3cret")).toBe(false);
		expect(isCronAuthorized("Basic s3cret", "s3cret")).toBe(false);
		expect(isCronAuthorized("Bearer ", "")).toBe(false);
	});
});
