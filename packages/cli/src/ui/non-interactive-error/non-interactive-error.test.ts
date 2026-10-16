import { describe, expect, it } from "vitest";

import { NonInteractiveError } from "./non-interactive-error.js";

describe("NonInteractiveError", () => {
	it("is an Error that names itself, so cli.ts can match it in USER_FACING_ERRORS", () => {
		const err = new NonInteractiveError("needs a TTY");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("NonInteractiveError");
		expect(err.message).toBe("needs a TTY");
	});
});
