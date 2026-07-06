import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

describe("resolveToken", () => {
	const noKeyring = () => null;

	it("prefers --token over env vars + keyring", () => {
		expect(
			resolveToken({
				cliToken: "flag",
				env: { HOLOCRON_DOPPLER_TOKEN: "hlc", DOPPLER_TOKEN: "vendor" },
				keyring: () => "kr",
			})
		).toBe("flag");
	});

	it("prefers HOLOCRON_DOPPLER_TOKEN over DOPPLER_TOKEN", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_DOPPLER_TOKEN: "hlc", DOPPLER_TOKEN: "vendor" },
				keyring: noKeyring,
			})
		).toBe("hlc");
	});

	it("falls back to DOPPLER_TOKEN when HOLOCRON_DOPPLER_TOKEN is unset", () => {
		expect(resolveToken({ env: { DOPPLER_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "doppler" ? "kr" : null) })).toBe("kr");
	});

	it("throws AuthError with a hint when no token is found anywhere", () => {
		try {
			resolveToken({ env: {}, keyring: noKeyring });
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(AuthError);
			expect((err as Error).message).toMatch(/doppler configure get token/);
			expect((err as Error).message).toMatch(/HOLOCRON_DOPPLER_TOKEN/);
		}
	});
});
