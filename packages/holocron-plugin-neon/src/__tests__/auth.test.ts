import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

describe("resolveToken", () => {
	it("uses the explicit CLI token first", () => {
		expect(
			resolveToken({
				cliToken: "cli-key",
				env: { HOLOCRON_NEON_API_KEY: "env-key", NEON_API_KEY: "cli-default" },
			})
		).toBe("cli-key");
	});

	it("prefers HOLOCRON_NEON_API_KEY over NEON_API_KEY", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_NEON_API_KEY: "env-key", NEON_API_KEY: "cli-default" },
			})
		).toBe("env-key");
	});

	it("falls back to NEON_API_KEY when only it is set", () => {
		expect(resolveToken({ env: { NEON_API_KEY: "cli-default" } })).toBe("cli-default");
	});

	it("throws AuthError when nothing is set", () => {
		expect(() => resolveToken({ env: {}, keyring: () => null })).toThrow(AuthError);
		expect(() => resolveToken({ env: {}, keyring: () => null })).toThrow(/HOLOCRON_NEON_API_KEY/);
	});
});
