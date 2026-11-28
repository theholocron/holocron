import { describe, expect, it } from "vitest";

import { AuthError } from "./auth-error.js";

describe("AuthError", () => {
	it("is an Error named AuthError, carrying its message", () => {
		const err = new AuthError("no token");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("AuthError");
		expect(err.message).toBe("no token");
	});
});
