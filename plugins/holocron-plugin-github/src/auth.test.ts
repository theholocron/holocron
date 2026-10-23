import { describe, expect, it } from "vitest";

import {
	AuthError,
	resolveAdminToken,
	resolveIssuesToken,
	resolveReadToken,
	resolveReleaseToken,
	resolveSecretsOrAdminToken,
	resolveSecretsToken,
	resolveSyncToken,
} from "./auth.js";

const noKeyring = () => null;

describe.each([
	{ name: "resolveReadToken", resolver: resolveReadToken, envName: "HOLOCRON_READ_TOKEN", keyringKey: "github.read" },
	{
		name: "resolveIssuesToken",
		resolver: resolveIssuesToken,
		envName: "HOLOCRON_ISSUES_TOKEN",
		keyringKey: "github.issues",
	},
	{ name: "resolveSyncToken", resolver: resolveSyncToken, envName: "HOLOCRON_SYNC_TOKEN", keyringKey: "github.sync" },
	{
		name: "resolveReleaseToken",
		resolver: resolveReleaseToken,
		envName: "HOLOCRON_RELEASE_TOKEN",
		keyringKey: "github.release",
	},
	{
		name: "resolveAdminToken",
		resolver: resolveAdminToken,
		envName: "HOLOCRON_ADMIN_TOKEN",
		keyringKey: "github.admin",
	},
	{
		name: "resolveSecretsToken",
		resolver: resolveSecretsToken,
		envName: "HOLOCRON_SECRETS_TOKEN",
		keyringKey: "github.secrets",
	},
])("$name", ({ resolver, envName, keyringKey }) => {
	it("uses the explicit CLI token first", () => {
		expect(resolver({ cliToken: "cli-pat", env: { [envName]: "env-pat" }, keyring: () => "kr-pat" })).toBe(
			"cli-pat"
		);
	});

	it("uses the feature env var when set", () => {
		expect(resolver({ env: { [envName]: "feat-pat" }, keyring: noKeyring })).toBe("feat-pat");
	});

	it("falls back to the keyring when the env var is absent", () => {
		expect(resolver({ env: {}, keyring: (p) => (p === keyringKey ? "kr-pat" : null) })).toBe("kr-pat");
	});

	it("does not fall back to GITHUB_TOKEN or any broad token", () => {
		expect(() => resolver({ env: { GITHUB_TOKEN: "broad" }, keyring: noKeyring })).toThrow(AuthError);
	});

	it("throws AuthError naming the feature env var and keyring key when nothing is set", () => {
		const err = (() => {
			try {
				resolver({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as Error).message).toMatch(new RegExp(envName));
		expect((err as Error).message).toMatch(new RegExp(keyringKey.replace(".", "\\.")));
	});
});

describe("resolveSecretsOrAdminToken", () => {
	it("prefers the dedicated secrets token (env, then keyring) over the admin token", () => {
		const env = { HOLOCRON_SECRETS_TOKEN: "secrets-env", HOLOCRON_ADMIN_TOKEN: "admin-env" };
		expect(resolveSecretsOrAdminToken({ env, keyring: noKeyring })).toBe("secrets-env");
		const keyring = (key: string) =>
			key === "github.secrets" ? "secrets-kr" : key === "github.admin" ? "admin-kr" : null;
		expect(resolveSecretsOrAdminToken({ env: {}, keyring })).toBe("secrets-kr");
	});

	it("falls back to the admin token when no secrets token is set", () => {
		expect(resolveSecretsOrAdminToken({ env: { HOLOCRON_ADMIN_TOKEN: "admin-env" }, keyring: noKeyring })).toBe(
			"admin-env"
		);
		const keyring = (key: string) => (key === "github.admin" ? "admin-kr" : null);
		expect(resolveSecretsOrAdminToken({ env: {}, keyring })).toBe("admin-kr");
	});

	it("lets an explicit token win over both", () => {
		expect(
			resolveSecretsOrAdminToken({
				cliToken: "cli",
				env: { HOLOCRON_SECRETS_TOKEN: "s", HOLOCRON_ADMIN_TOKEN: "a" },
				keyring: noKeyring,
			})
		).toBe("cli");
	});

	it("fails naming the admin token when neither is set", () => {
		expect(() => resolveSecretsOrAdminToken({ env: {}, keyring: noKeyring })).toThrow(AuthError);
		expect(() => resolveSecretsOrAdminToken({ env: {}, keyring: noKeyring })).toThrow(/HOLOCRON_ADMIN_TOKEN/);
	});

	it("does not swallow an error that is not a missing token", () => {
		const boom = () => {
			throw new TypeError("keyring exploded");
		};
		expect(() => resolveSecretsOrAdminToken({ env: {}, keyring: boom })).toThrow(TypeError);
	});
});
