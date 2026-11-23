import { describe, expect, it } from "vitest";

import { describeFailure, FAILURE_DETAIL_CHARS } from "./describe-failure.js";

class ApiError extends Error {
	constructor(
		message: string,
		readonly details?: unknown
	) {
		super(message);
	}
}

describe("describeFailure", () => {
	it("is the message alone for an error with no response text", () => {
		expect(describeFailure(new Error("boom"))).toBe("boom");
		expect(describeFailure(new ApiError("GitHub GET /x → 403"))).toBe("GitHub GET /x → 403");
		expect(describeFailure(new ApiError("GitHub GET /x → 403", "   "))).toBe("GitHub GET /x → 403");
		expect(describeFailure(new ApiError("GitHub GET /x → 403", { message: "not a string" }))).toBe(
			"GitHub GET /x → 403"
		);
	});

	it("adds GitHub's own text on one line, so a 403 says why", () => {
		const err = new ApiError(
			"GitHub GET /x → 403",
			'{"message":"API rate limit exceeded",\n"documentation_url":"u"}'
		);
		expect(describeFailure(err)).toBe(
			'GitHub GET /x → 403 ({"message":"API rate limit exceeded", "documentation_url":"u"})'
		);
	});

	it("cuts a long response", () => {
		const out = describeFailure(new ApiError("m", "x".repeat(FAILURE_DETAIL_CHARS + 50)));
		expect(out).toBe(`m (${"x".repeat(FAILURE_DETAIL_CHARS)}…)`);
	});

	it("takes a thrown value that is not an error", () => {
		expect(describeFailure("plain")).toBe("plain");
		expect(describeFailure(null)).toBe("null");
	});
});
