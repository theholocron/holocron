import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../plugin/index.js";
import { describeProviderError, logReason, sanitizeDetail } from "./provider-error.js";

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

describe("logReason", () => {
	it("leaves the response body out", () => {
		const err = new ProviderApiError("Discord PATCH /channels/1 → 403", 403, '{"message":"Missing Permissions"}');
		expect(logReason(err)).toBe("Discord PATCH /channels/1 → 403");
	});

	it("looks through a wrapper's cause, so a message that embeds the body is not logged", () => {
		const cause = new ProviderApiError("GitHub PUT /x → 403", 403, "secret-bearing body");
		const wrapper = new Error(`cannot write (${describeProviderError(cause)})`, { cause });
		expect(describeProviderError(wrapper)).toContain("secret-bearing body");
		expect(logReason(wrapper)).toBe("GitHub PUT /x → 403");
	});

	it("falls back to the error's own message when there is no cause", () => {
		expect(logReason(new Error("boom"))).toBe("boom");
		expect(logReason("text")).toBe("text");
	});
});
