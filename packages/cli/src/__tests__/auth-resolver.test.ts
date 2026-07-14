import { describe, expect, it } from "vitest";

import { AuthError, createResolveToken } from "../auth-resolver.js";

const noKeyring = () => null;

const resolveToken = createResolveToken({
	envName: "HOLOCRON_TEST_TOKEN",
	vendorEnvName: "TEST_TOKEN",
	keyringService: "test",
	errorMessage:
		"no test token found. Pass --token <TOKEN>, set HOLOCRON_TEST_TOKEN / TEST_TOKEN, or run: holocron auth set test <TOKEN>",
});

describe("createResolveToken", () => {
	it("uses the explicit CLI token first", () => {
		expect(
			resolveToken({
				cliToken: "cli-tok",
				env: { HOLOCRON_TEST_TOKEN: "env-tok", TEST_TOKEN: "vendor-tok" },
				keyring: () => "kr-tok",
			})
		).toBe("cli-tok");
	});

	it("prefers envName over vendorEnvName", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_TEST_TOKEN: "env-tok", TEST_TOKEN: "vendor-tok" },
				keyring: noKeyring,
			})
		).toBe("env-tok");
	});

	it("falls back to vendorEnvName when only it is set", () => {
		expect(resolveToken({ env: { TEST_TOKEN: "vendor-tok" }, keyring: noKeyring })).toBe("vendor-tok");
	});

	it("falls back to keyring when env vars are unset", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "test" ? "kr-tok" : null) })).toBe("kr-tok");
	});

	it("ignores empty-string cliToken", () => {
		expect(resolveToken({ cliToken: "", env: { TEST_TOKEN: "vendor-tok" }, keyring: noKeyring })).toBe(
			"vendor-tok"
		);
	});

	it("throws AuthError with the configured message when nothing is set", () => {
		const err = (() => {
			try {
				resolveToken({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).message).toMatch(/HOLOCRON_TEST_TOKEN/);
		expect((err as Error).message).toMatch(/--token/);
		expect((err as Error).message).toMatch(/holocron auth set test/);
	});

	it("AuthError.name is 'AuthError'", () => {
		const err = (() => {
			try {
				resolveToken({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).name).toBe("AuthError");
	});
});
