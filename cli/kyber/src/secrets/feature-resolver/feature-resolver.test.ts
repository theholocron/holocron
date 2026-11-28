import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth-error/index.js";
import { clearCredentials, setCredentials } from "../credential-store/index.js";
import { createFeatureResolver } from "./feature-resolver.js";

afterEach(() => {
	clearCredentials();
	vi.unstubAllEnvs();
});

const noKeyring = () => null;
const resolve = createFeatureResolver({ envName: "MYTOOL_FEAT_TOKEN", keyringKey: "github.feat", vendor: "GitHub" });

/** What a resolver throws, without calling it twice. */
function thrownBy(fn: () => unknown): unknown {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
}

describe("createFeatureResolver", () => {
	it("uses the flag first, and ignores an empty one", () => {
		expect(resolve({ cliToken: "cli", env: { MYTOOL_FEAT_TOKEN: "feat" }, keyring: () => "kr" })).toBe("cli");
		expect(resolve({ cliToken: "", env: { MYTOOL_FEAT_TOKEN: "feat" }, keyring: noKeyring })).toBe("feat");
	});

	it("then the feature's variable, then the keyring account", () => {
		expect(resolve({ env: { MYTOOL_FEAT_TOKEN: "feat" }, keyring: noKeyring })).toBe("feat");
		expect(resolve({ env: {}, keyring: (a) => (a === "github.feat" ? "kr" : null) })).toBe("kr");
	});

	it("reads the process environment when called with no arguments", () => {
		vi.stubEnv("MYTOOL_FEAT_TOKEN", "from-process");
		expect(resolve()).toBe("from-process");
	});

	it("does not fall back to a broad token", () => {
		expect(() =>
			resolve({ env: { GITHUB_TOKEN: "broad", MYTOOL_GITHUB_TOKEN: "also-broad" }, keyring: noKeyring })
		).toThrow(AuthError);
	});

	it("names the vendor, the variable and, when given, the command that stores a token", () => {
		const withCommand = createFeatureResolver({
			envName: "MYTOOL_SENTRY_TOKEN",
			keyringKey: "sentry.comlink",
			vendor: "Sentry",
			setCommand: (key) => `mytool auth set ${key} <token>`,
		});
		const err = thrownBy(() => withCommand({ env: {}, keyring: noKeyring })) as Error;
		expect(err).toBeInstanceOf(AuthError);
		expect(err.message).toBe(
			"no Sentry token found for this operation. Pass --token <token>, set MYTOOL_SENTRY_TOKEN, or run: mytool auth set sentry.comlink <token>"
		);
		const bare = thrownBy(() => resolve({ env: {}, keyring: noKeyring })) as Error;
		expect(bare.message).toBe(
			"no GitHub token found for this operation. Pass --token <token>, set MYTOOL_FEAT_TOKEN"
		);
	});

	describe("the keyring in the config", () => {
		const lookup = vi.fn((account: string) => (account === "github.feat" ? "from-config" : null));
		const withKeyring = createFeatureResolver({
			envName: "MYTOOL_FEAT_TOKEN",
			keyringKey: "github.feat",
			vendor: "GitHub",
			keyring: lookup,
		});

		it("is the default lookup, and an input keyring replaces it", () => {
			expect(withKeyring({ env: {} })).toBe("from-config");
			expect(withKeyring({ env: {}, keyring: () => "from-input" })).toBe("from-input");
		});

		it("comes after the credentials providers' variable of the same name", () => {
			setCredentials("1password:Env", { MYTOOL_FEAT_TOKEN: "stored" });
			lookup.mockClear();
			expect(withKeyring({ env: {} })).toBe("stored");
			expect(lookup).not.toHaveBeenCalled();
		});
	});

	it("lets the flag and the environment win over the credentials providers", () => {
		setCredentials("1password:Env", { MYTOOL_FEAT_TOKEN: "stored" });
		expect(resolve({ cliToken: "cli", env: {} })).toBe("cli");
		expect(resolve({ env: { MYTOOL_FEAT_TOKEN: "env" } })).toBe("env");
		expect(resolve({ env: {} })).toBe("stored");
	});
});
