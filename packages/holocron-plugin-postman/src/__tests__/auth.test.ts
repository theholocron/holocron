import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

describe("resolveToken", () => {
	it("uses the explicit CLI token first", () => {
		expect(
			resolveToken({
				cliToken: "cli-key",
				env: { HOLOCRON_POSTMAN_API_KEY: "env-key", POSTMAN_API_KEY: "native" },
			})
		).toBe("cli-key");
	});

	it("prefers HOLOCRON_POSTMAN_API_KEY over POSTMAN_API_KEY", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_POSTMAN_API_KEY: "env-key", POSTMAN_API_KEY: "native" },
			})
		).toBe("env-key");
	});

	it("falls back to POSTMAN_API_KEY when only it is set", () => {
		expect(resolveToken({ env: { POSTMAN_API_KEY: "native" } })).toBe("native");
	});

	it("throws AuthError when nothing is set", () => {
		const err = (() => { try { resolveToken({ env: {}, keyring: () => null }); } catch (e) { return e; } })();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).toMatch(/HOLOCRON_POSTMAN_API_KEY/);
	});
});
