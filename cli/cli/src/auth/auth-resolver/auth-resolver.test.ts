import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCredentials, setCredentials } from "../credential-store/index.js";
import { getToken } from "../keyring/index.js";
import { AuthError, createFeatureResolver, createResolveToken } from "./auth-resolver.js";

// The real keyring is never asked: a test that reaches it says what it returns.
vi.mock("../keyring/index.js", () => ({ getToken: vi.fn(() => null) }));

afterEach(clearCredentials);

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

describe("createFeatureResolver, vendor in the message", () => {
	it("names the vendor given, and GitHub when none is", () => {
		const sentry = createFeatureResolver({
			envName: "HOLOCRON_SENTRY_COMLINK_TOKEN",
			keyringKey: "sentry.comlink",
			vendor: "Sentry",
		});
		expect(() => sentry({ env: {}, keyring: () => null })).toThrow(
			/no Sentry token found.*HOLOCRON_SENTRY_COMLINK_TOKEN.*sentry\.comlink/
		);
		const github = createFeatureResolver({ envName: "HOLOCRON_X_TOKEN", keyringKey: "github.x" });
		expect(() => github({ env: {}, keyring: () => null })).toThrow(/no GitHub token found/);
	});
});

describe("createResolveToken, where it looks", () => {
	it("exposes the plugin and vendor environment variables and the keyring entry it reads", () => {
		expect(resolveToken.token).toEqual({
			envName: "HOLOCRON_TEST_TOKEN",
			vendorEnvName: "TEST_TOKEN",
			keyringKey: "test",
		});
	});
});

describe("createFeatureResolver, where it looks", () => {
	it("exposes the environment variable and keyring entry it reads, without the vendor", () => {
		const resolver = createFeatureResolver({
			envName: "HOLOCRON_SENTRY_COMLINK_TOKEN",
			keyringKey: "sentry.comlink",
			vendor: "Sentry",
		});
		expect(resolver.token).toEqual({ envName: "HOLOCRON_SENTRY_COMLINK_TOKEN", keyringKey: "sentry.comlink" });
		expect(resolver({ cliToken: "t", env: {}, keyring: () => null })).toBe("t");
	});
});

// The `credentials` providers' variables sit after the flag and the process environment and before the keyring. These
// tests give no `keyring`, so a value found in the store proves the real keyring was never asked.
describe("the credentials providers in the chain", () => {
	const feature = createFeatureResolver({
		envName: "HOLOCRON_TEST_FEATURE_TOKEN",
		keyringKey: "test.feature",
	});

	it("createResolveToken finds the project's variable in the store", () => {
		setCredentials("1password:Holocron", { HOLOCRON_TEST_TOKEN: "stored" });
		expect(resolveToken({ env: {} })).toBe("stored");
	});

	it("createResolveToken falls back to the vendor's variable name in the store", () => {
		setCredentials("1password:Holocron", { TEST_TOKEN: "stored-vendor" });
		expect(resolveToken({ env: {} })).toBe("stored-vendor");
	});

	it("createResolveToken lets the flag and the process environment win over the store", () => {
		setCredentials("1password:Holocron", { HOLOCRON_TEST_TOKEN: "stored" });
		expect(resolveToken({ cliToken: "cli-tok", env: {} })).toBe("cli-tok");
		expect(resolveToken({ env: { HOLOCRON_TEST_TOKEN: "env-tok" } })).toBe("env-tok");
	});

	it("createFeatureResolver finds its variable in the store", () => {
		setCredentials("1password:Holocron", { HOLOCRON_TEST_FEATURE_TOKEN: "stored" });
		expect(feature({ env: {} })).toBe("stored");
	});

	it("createFeatureResolver lets the flag and the process environment win over the store", () => {
		setCredentials("1password:Holocron", { HOLOCRON_TEST_FEATURE_TOKEN: "stored" });
		expect(feature({ cliToken: "cli-tok", env: {} })).toBe("cli-tok");
		expect(feature({ env: { HOLOCRON_TEST_FEATURE_TOKEN: "env-tok" } })).toBe("env-tok");
	});

	it("an injected keyring replaces the store and the real keyring, as before", () => {
		setCredentials("1password:Holocron", { HOLOCRON_TEST_TOKEN: "stored" });
		expect(resolveToken({ env: {}, keyring: () => "kr-tok" })).toBe("kr-tok");
	});

	it("asks the keyring when the store has nothing", () => {
		vi.mocked(getToken).mockReturnValueOnce("kr-tok").mockReturnValueOnce("kr-feature");
		expect(resolveToken({ env: {} })).toBe("kr-tok");
		expect(feature({ env: {} })).toBe("kr-feature");
	});
});
