import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

describe("resolveToken", () => {
	it("uses the explicit CLI token first", () => {
		expect(
			resolveToken({
				cliToken: "sk_test_cli",
				env: { HOLOCRON_CLERK_SECRET_KEY: "sk_test_env", CLERK_SECRET_KEY: "sk_test_native" },
			})
		).toBe("sk_test_cli");
	});

	it("prefers HOLOCRON_CLERK_SECRET_KEY over CLERK_SECRET_KEY", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_CLERK_SECRET_KEY: "sk_test_env", CLERK_SECRET_KEY: "sk_test_native" },
			})
		).toBe("sk_test_env");
	});

	it("falls back to CLERK_SECRET_KEY when only it is set", () => {
		expect(resolveToken({ env: { CLERK_SECRET_KEY: "sk_test_native" } })).toBe("sk_test_native");
	});

	it("throws AuthError with a helpful message when nothing is set", () => {
		expect(() => resolveToken({ env: {} })).toThrow(AuthError);
		expect(() => resolveToken({ env: {} })).toThrow(/HOLOCRON_CLERK_SECRET_KEY/);
	});
});
