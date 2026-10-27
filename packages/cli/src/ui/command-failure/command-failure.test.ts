import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../plugin/index.js";
import { commandFailureMessage, USER_FACING_ERRORS } from "./command-failure.js";

describe("commandFailureMessage", () => {
	it("says what a plain Error says", () => {
		expect(commandFailureMessage(new Error("deploy capability is not configured"))).toBe(
			"deploy capability is not configured"
		);
	});

	it("strips control characters a provider's text may carry", () => {
		expect(commandFailureMessage(new Error("bad\u001b[31m token\nline two"))).toBe("bad [31m token line two");
	});

	it("adds a provider's response detail", () => {
		const err = new ProviderApiError("GitHub GET /orgs/x → 403", 403, "Resource not accessible");
		expect(commandFailureMessage(err)).toContain("Resource not accessible");
	});

	it("prints something for a thrown string, and for an error with no message", () => {
		expect(commandFailureMessage("boom")).toBe("boom");
		expect(commandFailureMessage(new TypeError(""))).toBe("TypeError");
		expect(commandFailureMessage(undefined)).not.toBe("");
	});

	it("keeps the list of errors written to be read as they are", () => {
		expect(USER_FACING_ERRORS.has("ConfigFileError")).toBe(true);
		expect(USER_FACING_ERRORS.has("Error")).toBe(false);
	});
});
