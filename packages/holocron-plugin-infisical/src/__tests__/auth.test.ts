import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

const noKeyring = () => null;

describe("resolveToken", () => {
	it("prefers --token over env vars + keyring", () => {
		expect(
			resolveToken({
				cliToken: "flag",
				env: { HOLOCRON_INFISICAL_TOKEN: "hlc", INFISICAL_TOKEN: "vendor" },
				keyring: () => "kr",
			})
		).toBe("flag");
	});

	it("prefers HOLOCRON_INFISICAL_TOKEN over INFISICAL_TOKEN", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_INFISICAL_TOKEN: "hlc", INFISICAL_TOKEN: "vendor" },
				keyring: noKeyring,
			})
		).toBe("hlc");
	});

	it("falls back to INFISICAL_TOKEN when HOLOCRON_INFISICAL_TOKEN is unset", () => {
		expect(resolveToken({ env: { INFISICAL_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "infisical" ? "kr" : null) })).toBe("kr");
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
		expect((err as Error).message).toMatch(/HOLOCRON_INFISICAL_TOKEN/);
		expect((err as Error).message).toMatch(/holocron auth set infisical/);
	});
});
