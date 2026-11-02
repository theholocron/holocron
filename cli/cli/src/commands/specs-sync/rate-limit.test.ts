import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../plugin/index.js";
import { rateLimitedFor } from "./rate-limit.js";

describe("rateLimitedFor", () => {
	it("reads how long Discord asks to be left alone, rounded up to whole seconds", () => {
		const err = new ProviderApiError(
			"Discord 429",
			429,
			'{"message":"You are being rate limited.","retry_after":253.852}'
		);

		expect(rateLimitedFor(err)).toBe(254);
	});

	it("is 0 for a rate limit that does not say for how long", () => {
		expect(rateLimitedFor(new ProviderApiError("429", 429, "too many"))).toBe(0);
		expect(rateLimitedFor(new ProviderApiError("429", 429))).toBe(0);
	});

	it("is undefined for any other error, whether a provider error or not", () => {
		expect(rateLimitedFor(new ProviderApiError("403", 403, '{"retry_after":5}'))).toBeUndefined();
		expect(rateLimitedFor(new Error("boom"))).toBeUndefined();
		expect(rateLimitedFor("429")).toBeUndefined();
	});
});
