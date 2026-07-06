import { describe, expect, it } from "vitest";

import { AuthError, resolveToken } from "../auth.js";

const noKeyring = () => null;

describe("resolveToken", () => {
	it("uses the explicit CLI token first", () => {
		expect(
			resolveToken({
				cliToken: "cli-pat",
				env: { HOLOCRON_GH_TOKEN: "env-pat", GITHUB_TOKEN: "gha-pat" },
				keyring: () => "kr-pat",
			})
		).toBe("cli-pat");
	});

	it("prefers HOLOCRON_GH_TOKEN over GITHUB_TOKEN", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_GH_TOKEN: "env-pat", GITHUB_TOKEN: "gha-pat" },
				keyring: noKeyring,
			})
		).toBe("env-pat");
	});

	it("falls back to GITHUB_TOKEN when only it is set", () => {
		expect(resolveToken({ env: { GITHUB_TOKEN: "gha-pat" }, keyring: noKeyring })).toBe("gha-pat");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "github" ? "kr-pat" : null) })).toBe("kr-pat");
	});

	it("throws AuthError with a helpful message when nothing is set", () => {
		try {
			resolveToken({ env: {}, keyring: noKeyring });
			throw new Error("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(AuthError);
			expect((err as Error).message).toMatch(/HOLOCRON_GH_TOKEN/);
			expect((err as Error).message).toMatch(/--token/);
			expect((err as Error).message).toMatch(/holocron auth set github/);
		}
	});

	it("ignores empty-string cliToken (treats as absent)", () => {
		expect(
			resolveToken({ cliToken: "", env: { GITHUB_TOKEN: "gha-pat" }, keyring: noKeyring })
		).toBe("gha-pat");
	});
});
