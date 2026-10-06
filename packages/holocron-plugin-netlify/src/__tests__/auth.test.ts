import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

const noKeyring = () => null;

describe("resolveToken", () => {
	it("prefers --token over env vars + keyring", () => {
		expect(
			resolveToken({
				cliToken: "flag",
				env: { HOLOCRON_NETLIFY_TOKEN: "hlc", NETLIFY_AUTH_TOKEN: "vendor" },
				keyring: () => "kr",
			})
		).toBe("flag");
	});

	it("prefers HOLOCRON_NETLIFY_TOKEN over NETLIFY_AUTH_TOKEN", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_NETLIFY_TOKEN: "hlc", NETLIFY_AUTH_TOKEN: "vendor" },
				keyring: noKeyring,
			})
		).toBe("hlc");
	});

	it("falls back to NETLIFY_AUTH_TOKEN when HOLOCRON_NETLIFY_TOKEN is unset", () => {
		expect(resolveToken({ env: { NETLIFY_AUTH_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "netlify" ? "kr" : null) })).toBe("kr");
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
		expect((err as Error).message).toMatch(/HOLOCRON_NETLIFY_TOKEN/);
		expect((err as Error).message).toMatch(/holocron auth set netlify/);
	});
});
