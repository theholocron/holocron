import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../plugin/index.js";
import { describeProviderError, sanitizeDetail } from "./provider-error.js";

describe("sanitizeDetail", () => {
	it("flattens whitespace and strips control characters, including the C1 range", () => {
		expect(sanitizeDetail("a\n\tb\u001b[2J\u009bc")).toBe("a b [2J c");
	});

	it("caps the length with an ellipsis", () => {
		const out = sanitizeDetail("x".repeat(500));
		expect(out).toHaveLength(201);
		expect(out.endsWith("…")).toBe(true);
	});
});

describe("describeProviderError", () => {
	it("appends the vendor's response body to the bare status", () => {
		const err = new ProviderApiError(
			"Discord PATCH /channels/1 → 403",
			403,
			'{"message":"Missing Permissions","code":50013}'
		);
		expect(describeProviderError(err)).toBe(
			'Discord PATCH /channels/1 → 403: {"message":"Missing Permissions","code":50013}'
		);
	});

	it("keeps control characters from the body out of the message", () => {
		const err = new ProviderApiError("X → 400", 400, "bad\u001b[31m\nFAKE");
		expect(describeProviderError(err)).toBe("X → 400: bad [31m FAKE");
	});

	it("falls back to the plain message when there is no body, or the error is not a provider error", () => {
		expect(describeProviderError(new ProviderApiError("X → 500", 500, ""))).toBe("X → 500");
		expect(describeProviderError(new Error("boom"))).toBe("boom");
		expect(describeProviderError("just a string")).toBe("just a string");
	});
});
