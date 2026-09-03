import { describe, expect, it } from "vitest";

import { AuthError, createFeatureResolver, createResolveToken } from "../auth/auth-resolver.js";

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

describe("createFeatureResolver", () => {
	const resolveFeature = createFeatureResolver({
		envName: "HOLOCRON_FEAT_TOKEN",
		keyringKey: "github.feat",
	});

	it("uses the explicit CLI token first", () => {
		expect(
			resolveFeature({
				cliToken: "cli-tok",
				env: { HOLOCRON_FEAT_TOKEN: "feat-tok" },
				keyring: () => "kr-tok",
			})
		).toBe("cli-tok");
	});

	it("uses the feature env var when no CLI token is given", () => {
		expect(resolveFeature({ env: { HOLOCRON_FEAT_TOKEN: "feat-tok" }, keyring: noKeyring })).toBe("feat-tok");
	});

	it("falls back to the keyring when the env var is absent", () => {
		expect(resolveFeature({ env: {}, keyring: (p) => (p === "github.feat" ? "kr-tok" : null) })).toBe("kr-tok");
	});

	it("reads process.env when called with no arguments (covers default parameter branch)", () => {
		const prev = process.env["HOLOCRON_FEAT_TOKEN"];
		process.env["HOLOCRON_FEAT_TOKEN"] = "env-via-process";
		try {
			expect(resolveFeature()).toBe("env-via-process");
		} finally {
			if (prev === undefined) delete process.env["HOLOCRON_FEAT_TOKEN"];
			else process.env["HOLOCRON_FEAT_TOKEN"] = prev;
		}
	});

	it("does not fall back to GITHUB_TOKEN or any broad token", () => {
		expect(() =>
			resolveFeature({ env: { GITHUB_TOKEN: "broad", HOLOCRON_GITHUB_TOKEN: "also-broad" }, keyring: noKeyring })
		).toThrow(AuthError);
	});

	it("ignores empty-string cliToken", () => {
		expect(resolveFeature({ cliToken: "", env: { HOLOCRON_FEAT_TOKEN: "feat-tok" }, keyring: noKeyring })).toBe(
			"feat-tok"
		);
	});

	it("throws AuthError naming the feature env var and keyring command when nothing is set", () => {
		const err = (() => {
			try {
				resolveFeature({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).message).toMatch(/HOLOCRON_FEAT_TOKEN/);
		expect((err as Error).message).toMatch(/--token/);
		expect((err as Error).message).toMatch(/holocron auth set github\.feat/);
	});

	it("AuthError.name is 'AuthError'", () => {
		const err = (() => {
			try {
				resolveFeature({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).name).toBe("AuthError");
	});
});
