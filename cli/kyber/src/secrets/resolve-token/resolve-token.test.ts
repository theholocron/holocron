import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth-error/index.js";
import { clearCredentials, setCredentials } from "../credential-store/index.js";
import { createResolveToken } from "./resolve-token.js";

afterEach(() => {
	clearCredentials();
	vi.unstubAllEnvs();
});

const noKeyring = () => null;
const base = {
	envName: "MYTOOL_TEST_TOKEN",
	vendorEnvName: "TEST_TOKEN",
	keyringService: "test",
	errorMessage: "no test token. Pass --token, or set MYTOOL_TEST_TOKEN or TEST_TOKEN",
};
const resolveToken = createResolveToken(base);

/** What a resolver throws, without calling it twice. */
function thrownBy(fn: () => unknown): unknown {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
}

describe("createResolveToken", () => {
	it("uses the flag first", () => {
		expect(resolveToken({ cliToken: "cli", env: { MYTOOL_TEST_TOKEN: "env" }, keyring: () => "kr" })).toBe("cli");
	});

	it("prefers the tool's variable to the vendor's, and skips an empty one", () => {
		expect(resolveToken({ env: { MYTOOL_TEST_TOKEN: "env", TEST_TOKEN: "vendor" }, keyring: noKeyring })).toBe(
			"env"
		);
		expect(resolveToken({ env: { TEST_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
		expect(resolveToken({ env: { MYTOOL_TEST_TOKEN: "", TEST_TOKEN: "vendor" }, keyring: noKeyring })).toBe(
			"vendor"
		);
	});

	it("ignores an empty flag", () => {
		expect(resolveToken({ cliToken: "", env: { TEST_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
	});

	it("falls back to the keyring account named for the service", () => {
		expect(resolveToken({ env: {}, keyring: (a) => (a === "test" ? "kr" : null) })).toBe("kr");
	});

	it("reads the process environment when no env is given", () => {
		vi.stubEnv("MYTOOL_TEST_TOKEN", "from-process");
		expect(resolveToken({ keyring: noKeyring })).toBe("from-process");
	});

	it("throws an AuthError with the configured message when nothing has a token", () => {
		const err = thrownBy(() => resolveToken({ env: {}, keyring: noKeyring }));
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).message).toBe(base.errorMessage);
	});

	it("does not ask the keyring when the config names none", () => {
		expect(() => resolveToken({ env: {} })).toThrow(AuthError);
	});

	describe("the keyring in the config", () => {
		const lookup = vi.fn((account: string) => (account === "test" ? "from-config" : null));
		const withKeyring = createResolveToken({ ...base, keyring: lookup });

		it("is the default lookup", () => {
			expect(withKeyring({ env: {} })).toBe("from-config");
		});

		it("is replaced by an input keyring", () => {
			expect(withKeyring({ env: {}, keyring: () => "from-input" })).toBe("from-input");
		});
	});

	describe("the active org", () => {
		const accounts: string[] = [];
		const orgKeyring = (account: string) => {
			accounts.push(account);
			return account === "test.acme" ? "org-token" : account === "test" ? "plain-token" : null;
		};
		const scoped = createResolveToken({ ...base, orgEnvName: "MYTOOL_ORG" });

		afterEach(() => (accounts.length = 0));

		it("tries <service>.<org> before <service> when the input names an org", () => {
			expect(scoped({ env: {}, org: "acme", keyring: orgKeyring })).toBe("org-token");
			expect(accounts).toEqual(["test.acme"]);
		});

		it("reads the org from the variable the config names", () => {
			expect(scoped({ env: { MYTOOL_ORG: "acme" }, keyring: orgKeyring })).toBe("org-token");
		});

		it("lets the input org win over the variable", () => {
			expect(scoped({ env: { MYTOOL_ORG: "other" }, org: "acme", keyring: orgKeyring })).toBe("org-token");
		});

		it("falls back to the plain account when the org's has none", () => {
			expect(scoped({ env: {}, org: "nobody", keyring: orgKeyring })).toBe("plain-token");
			expect(accounts).toEqual(["test.nobody", "test"]);
		});

		it("skips the org lookup when no org is active", () => {
			expect(scoped({ env: {}, keyring: orgKeyring })).toBe("plain-token");
			expect(accounts).toEqual(["test"]);
		});

		it("reads no org variable when the config names none", () => {
			expect(resolveToken({ env: { MYTOOL_ORG: "acme" }, keyring: orgKeyring })).toBe("plain-token");
			expect(accounts).toEqual(["test"]);
		});
	});

	describe("the credentials providers' variables", () => {
		it("are found under the tool's name, then the vendor's, ahead of the keyring", () => {
			const asked = vi.fn(() => "kr");
			const resolve = createResolveToken({ ...base, keyring: asked });
			setCredentials("1password:Env", { MYTOOL_TEST_TOKEN: "stored" });
			expect(resolve({ env: {} })).toBe("stored");
			expect(asked).not.toHaveBeenCalled();
			setCredentials("1password:Env", { TEST_TOKEN: "stored-vendor" });
			expect(resolve({ env: {} })).toBe("stored-vendor");
		});

		it("lose to the flag and the environment", () => {
			setCredentials("1password:Env", { MYTOOL_TEST_TOKEN: "stored" });
			expect(resolveToken({ cliToken: "cli", env: {} })).toBe("cli");
			expect(resolveToken({ env: { MYTOOL_TEST_TOKEN: "env" } })).toBe("env");
		});

		it("are bypassed by an input keyring", () => {
			setCredentials("1password:Env", { MYTOOL_TEST_TOKEN: "stored" });
			expect(resolveToken({ env: {}, keyring: () => "kr" })).toBe("kr");
		});
	});
});
