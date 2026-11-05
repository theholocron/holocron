import { describe, expect, it } from "vitest";

import { describeError } from "../describe-error/index.js";
import { logReason } from "./log-reason.js";

class ApiError extends Error {
	constructor(
		message: string,
		readonly details: string
	) {
		super(message);
	}
}

describe("logReason", () => {
	it("leaves the response body out", () => {
		const err = new ApiError("Discord PATCH /channels/1 → 403", '{"message":"Missing Permissions"}');
		expect(logReason(err)).toBe("Discord PATCH /channels/1 → 403");
	});

	it("looks through a wrapper's cause, so a message that embeds the body is not logged", () => {
		const cause = new ApiError("GitHub PUT /x → 403", "secret-bearing body");
		const wrapper = new Error(`cannot write (${describeError(cause)})`, { cause });
		expect(describeError(wrapper)).toContain("secret-bearing body");
		expect(logReason(wrapper)).toBe("GitHub PUT /x → 403");
	});

	it("falls back to the error's own message when there is no cause", () => {
		expect(logReason(new Error("boom"))).toBe("boom");
		expect(logReason("text")).toBe("text");
	});
});
