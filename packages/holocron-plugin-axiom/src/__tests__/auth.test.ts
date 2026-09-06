import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

describe("resolveToken", () => {
	const noKeyring = () => null;

	it("prefers --token over env vars + keyring", () => {
		expect(
			resolveToken({
				cliToken: "flag",
				env: { HOLOCRON_AXIOM_TOKEN: "hlc", AXIOM_TOKEN: "vendor" },
				keyring: () => "kr",
			})
		).toBe("flag");
	});

	it("prefers HOLOCRON_AXIOM_TOKEN over AXIOM_TOKEN", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_AXIOM_TOKEN: "hlc", AXIOM_TOKEN: "vendor" },
				keyring: noKeyring,
			})
		).toBe("hlc");
	});

	it("falls back to AXIOM_TOKEN when HOLOCRON_AXIOM_TOKEN is unset", () => {
		expect(resolveToken({ env: { AXIOM_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "axiom" ? "kr" : null) })).toBe("kr");
	});

	it("throws AuthError naming both env vars when no token is found anywhere", () => {
		const err = (() => {
			try {
				resolveToken({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).message).toMatch(/HOLOCRON_AXIOM_TOKEN/);
		expect((err as Error).message).toMatch(/AXIOM_TOKEN/);
		expect((err as Error).message).toMatch(/holocron auth set axiom/);
	});
});
