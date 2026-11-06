import { describe, expect, it } from "vitest";

import { describeError } from "./describe-error.js";

/** An API error whose `details` is the raw response body. */
class ApiError extends Error {
	constructor(
		message: string,
		readonly details: string
	) {
		super(message);
	}
}

describe("describeError", () => {
	it("appends the response body to the bare status", () => {
		const err = new ApiError("Discord PATCH /channels/1 → 403", '{"message":"Missing Permissions","code":50013}');
		expect(describeError(err)).toBe(
			'Discord PATCH /channels/1 → 403: {"message":"Missing Permissions","code":50013}'
		);
	});

	it("keeps control characters from the body out of the message", () => {
		expect(describeError(new ApiError("X → 400", "bad\u001b[31m\nFAKE"))).toBe("X → 400: bad [31m FAKE");
	});

	it("falls back to the plain message when the body is nothing but control characters", () => {
		expect(describeError(new ApiError("X → 502", "\n\t\u001b \u009b"))).toBe("X → 502");
	});

	it("falls back to the plain message when there is no body, or the error has none", () => {
		expect(describeError(new ApiError("X → 500", ""))).toBe("X → 500");
		expect(describeError(new Error("boom"))).toBe("boom");
		expect(describeError("just a string")).toBe("just a string");
	});

	it("strips control characters from the message of an ordinary error and of a thrown string", () => {
		expect(describeError(new Error("bad\u001b[31m\nFAKE ROW"))).toBe("bad [31m FAKE ROW");
		expect(describeError("plain\u009bstring")).toBe("plain string");
	});
});
