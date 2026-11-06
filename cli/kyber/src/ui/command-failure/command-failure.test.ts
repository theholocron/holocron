import { describe, expect, it } from "vitest";

import { commandFailureMessage } from "./command-failure.js";

describe("commandFailureMessage", () => {
	it("says what a plain Error says", () => {
		expect(commandFailureMessage(new Error("deploy capability is not configured"))).toBe(
			"deploy capability is not configured"
		);
	});

	it("strips control characters a provider's text may carry", () => {
		expect(commandFailureMessage(new Error("bad\u001b[31m token\nline two"))).toBe("bad [31m token line two");
	});

	it("adds the response detail an API error carries", () => {
		const err = Object.assign(new Error("GitHub GET /orgs/x → 403"), { details: "Resource not accessible" });
		expect(commandFailureMessage(err)).toBe("GitHub GET /orgs/x → 403: Resource not accessible");
	});

	it("prints something for a thrown string, and for an error with no message", () => {
		expect(commandFailureMessage("boom")).toBe("boom");
		expect(commandFailureMessage(new TypeError(""))).toBe("TypeError");
		expect(commandFailureMessage(undefined)).not.toBe("");
	});

	it("names the command when a thrown value has no text at all", () => {
		expect(commandFailureMessage("")).toBe("the command failed");
	});
});
