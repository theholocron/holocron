import { describe, expect, it } from "vitest";

import { AuthError, createResolveToken } from "../auth-resolver.js";

const noKeyring = () => null;

const resolveToken = createResolveToken({
	envName: "HOLOCRON_TEST_TOKEN",
	vendorEnvName: "TEST_TOKEN",
	keyringService: "test",
	errorMessage: "no test token. Pass --token or set HOLOCRON_TEST_TOKEN / TEST_TOKEN",
});

describe("createResolveToken", () => {
	it("uses cliToken first", () => {
		expect(resolveToken({ cliToken: "cli", env: { HOLOCRON_TEST_TOKEN: "env" }, keyring: noKeyring })).toBe("cli");
	});

	it("prefers envName over vendorEnvName", () => {
		expect(resolveToken({ env: { HOLOCRON_TEST_TOKEN: "env", TEST_TOKEN: "vendor" }, keyring: noKeyring })).toBe("env");
	});

	it("falls back to vendorEnvName", () => {
		expect(resolveToken({ env: { TEST_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to keyring", () => {
		expect(resolveToken({ env: {}, keyring: (p) => (p === "test" ? "kr" : null) })).toBe("kr");
	});

	it("ignores empty-string cliToken", () => {
		expect(resolveToken({ cliToken: "", env: { TEST_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("throws AuthError when nothing is set", () => {
		const err = (() => { try { resolveToken({ env: {}, keyring: noKeyring }); } catch (e) { return e; } })();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).name).toBe("AuthError");
	});
});
