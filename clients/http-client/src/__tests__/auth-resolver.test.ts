import { describe, expect, it } from "vitest";

import { AuthError, createResolveToken } from "../auth-resolver.js";

const noKeyring = () => null;

const resolveToken = createResolveToken({
	envName: "HOLOCRON_TEST_TOKEN",
	vendorEnvName: "TEST_TOKEN",
	keyringService: "test",
	errorMessage:
		"no test token. Pass --token or set HOLOCRON_TEST_TOKEN / TEST_TOKEN",
});

describe("createResolveToken", () => {
	it("uses cliToken first", () => {
		expect(
			resolveToken({
				cliToken: "cli",
				env: { HOLOCRON_TEST_TOKEN: "env" },
				keyring: noKeyring,
			}),
		).toBe("cli");
	});

	it("prefers envName over vendorEnvName", () => {
		expect(
			resolveToken({
				env: { HOLOCRON_TEST_TOKEN: "env", TEST_TOKEN: "vendor" },
				keyring: noKeyring,
			}),
		).toBe("env");
	});

	it("falls back to vendorEnvName", () => {
		expect(
			resolveToken({ env: { TEST_TOKEN: "vendor" }, keyring: noKeyring }),
		).toBe("vendor");
	});

	it("falls back to keyring", () => {
		expect(
			resolveToken({
				env: {},
				keyring: (p) => (p === "test" ? "kr" : null),
			}),
		).toBe("kr");
	});

	it("ignores empty-string cliToken", () => {
		expect(
			resolveToken({
				cliToken: "",
				env: { TEST_TOKEN: "vendor" },
				keyring: noKeyring,
			}),
		).toBe("vendor");
	});

	it("throws AuthError when nothing is set", () => {
		const err = (() => {
			try {
				resolveToken({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).name).toBe("AuthError");
	});

	it("falls back to process.env when env is not provided", () => {
		process.env["HOLOCRON_TEST_TOKEN"] = "from-process-env";
		try {
			expect(resolveToken({ keyring: noKeyring })).toBe(
				"from-process-env",
			);
		} finally {
			delete process.env["HOLOCRON_TEST_TOKEN"];
		}
	});

	it("falls back to defaultKeyring when keyring is not provided", () => {
		// defaultKeyring = () => null, so it falls through to throwing
		const err = (() => {
			try {
				resolveToken({ env: {} });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
	});
});

describe("createResolveToken — with getKeyringToken", () => {
	it("uses getKeyringToken from config as the default keyring", () => {
		const configKeyring = (p: string) =>
			p === "test" ? "from-config-kr" : null;
		const resolver = createResolveToken({
			envName: "HOLOCRON_TEST_TOKEN",
			vendorEnvName: "TEST_TOKEN",
			keyringService: "test",
			errorMessage: "no token",
			getKeyringToken: configKeyring,
		});
		expect(resolver({ env: {} })).toBe("from-config-kr");
	});
});
