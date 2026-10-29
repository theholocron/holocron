import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "./auth.js";

const noKeyring = () => null;

describe("resolveToken", () => {
	it("prefers --token over env vars + keyring", () => {
		expect(
			resolveToken({
				cliToken: "flag",
				env: { HOLOCRON_CHECKLY_TOKEN: "hlc", CHECKLY_API_KEY: "vendor" },
				keyring: () => "kr",
			})
		).toBe("flag");
	});

	it("prefers HOLOCRON_CHECKLY_TOKEN over CHECKLY_API_KEY", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_CHECKLY_TOKEN: "hlc", CHECKLY_API_KEY: "vendor" },
				keyring: noKeyring,
			})
		).toBe("hlc");
	});

	it("falls back to CHECKLY_API_KEY when HOLOCRON_CHECKLY_TOKEN is unset", () => {
		expect(resolveToken({ env: { CHECKLY_API_KEY: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "checkly" ? "kr" : null) })).toBe("kr");
	});

	it("throws AuthError with a helpful message when nothing is set", () => {
		const err = (() => {
			try {
				resolveToken({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).message).toMatch(/HOLOCRON_CHECKLY_TOKEN/);
		expect((err as Error).message).toMatch(/holocron auth set checkly/);
	});
});
