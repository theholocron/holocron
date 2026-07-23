import { describe, expect, it } from "vitest";

import {
	AuthError,
	resolveAdminToken,
	resolveIssuesToken,
	resolveReadToken,
	resolveReleaseToken,
	resolveSyncToken,
} from "../auth.js";

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
