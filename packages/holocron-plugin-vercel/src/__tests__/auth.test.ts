import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

describe("resolveToken", () => {
	it("uses the explicit CLI token first", () => {
		expect(
			resolveToken({
				cliToken: "cli-pat",
				env: { HOLOCRON_VERCEL_TOKEN: "env-pat", VERCEL_TOKEN: "cli-default" },
			})
		).toBe("cli-pat");
	});

	it("prefers HOLOCRON_VERCEL_TOKEN over VERCEL_TOKEN", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_VERCEL_TOKEN: "env-pat", VERCEL_TOKEN: "cli-default" },
			})
		).toBe("env-pat");
	});

	it("falls back to VERCEL_TOKEN when only it is set", () => {
		expect(resolveToken({ env: { VERCEL_TOKEN: "cli-default" } })).toBe("cli-default");
	});

	it("throws AuthError with a helpful message when nothing is set", () => {
		expect(() => resolveToken({ env: {}, keyring: () => null })).toThrow(AuthError);
		expect(() => resolveToken({ env: {}, keyring: () => null })).toThrow(/HOLOCRON_VERCEL_TOKEN/);
	});
});
