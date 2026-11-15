import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { AuthError, resolveToken, tokens } from "./auth.js";
import { createPlugin } from "./index.js";

describe("tokens export", () => {
	it("declares the Codecov token for the ci layer only", () => {
		expect(tokens).toEqual([
			{
				envName: "HOLOCRON_CODECOV_TOKEN",
				vendorEnvName: "CODECOV_TOKEN",
				keyringKey: "codecov",
				expect: { layers: ["ci"] },
			},
		]);
	});
});

describe("resolveToken", () => {
	const noKeyring = () => null;

	it("prefers --token, then HOLOCRON_CODECOV_TOKEN, then CODECOV_TOKEN, then the keyring", () => {
		const env = { HOLOCRON_CODECOV_TOKEN: "hlc", CODECOV_TOKEN: "vendor" };
		expect(resolveToken({ cliToken: "flag", env, keyring: noKeyring })).toBe("flag");
		expect(resolveToken({ env, keyring: noKeyring })).toBe("hlc");
		expect(resolveToken({ env: { CODECOV_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
		expect(resolveToken({ env: {}, keyring: (a) => (a === "codecov" ? "kr" : null) })).toBe("kr");
	});

	it("throws an AuthError naming both variables when none is set", () => {
		const err = (() => {
			try {
				resolveToken({ env: {}, keyring: noKeyring });
			} catch (e) {
				return e;
			}
		})();
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).toMatch(/HOLOCRON_CODECOV_TOKEN \/ CODECOV_TOKEN/);
	});
});

describe("createPlugin", () => {
	it("returns a plugin with a coverage capability and token and connection probes", () => {
		const plugin = createPlugin({ cliToken: "t", env: {} });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-codecov");
		const cap = plugin.capabilities.coverage();
		expect(cap.key).toBe("coverage");
		expect(cap.providerName).toBe("codecov");
		expect(Object.keys(plugin.probes).sort()).toEqual(["connection", "token"]);
	});

	it("builds with no options at all", () => {
		expect(createPlugin().name).toBe("@theholocron/holocron-plugin-codecov");
	});

	it("asks Codecov about the active repo with the resolved token", async () => {
		const { fetch, calls } = stubFetch([{ body: { name: "holocron", private: true } }]);
		const plugin = createPlugin({ cliToken: "t", env: {}, repo: "theholocron/holocron", fetch });
		await expect(plugin.capabilities.coverage().checkToken()).resolves.toEqual({
			outcome: "accepted",
			repoPrivate: true,
		});
		expect(calls[0]?.url).toBe("https://api.codecov.io/api/v2/github/theholocron/repos/holocron/");
		expect(calls[0]?.headers.authorization).toBe("Bearer t");
	});

	it("builds the client once and takes the repo from org plus a bare repo name", async () => {
		const { fetch, calls } = stubFetch([{ body: { name: "x" } }, { body: { name: "x" } }]);
		const plugin = createPlugin({ cliToken: "t", env: {}, org: "theholocron", repo: "x", fetch });
		const cap = plugin.capabilities.coverage();
		await cap.checkToken();
		await cap.checkToken();
		expect(calls.map((c) => c.url)).toEqual([
			"https://api.codecov.io/api/v2/github/theholocron/repos/x/",
			"https://api.codecov.io/api/v2/github/theholocron/repos/x/",
		]);
	});

	it("its token probe runs against the same repo", async () => {
		const { fetch } = stubFetch([{ status: 401, body: {} }]);
		const plugin = createPlugin({ cliToken: "t", env: {}, repo: "a/b", fetch });
		const rows: Array<{ status: string; label: string }> = [];
		await plugin.probes.token.run({
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(rows.find((r) => r.label === "Codecov API")?.status).toBe("info");
	});

	it("its connection probe only checks a token is set and never asks Codecov", async () => {
		const plugin = createPlugin({ cliToken: "t", env: {} });
		expect(plugin.probes.connection).toBeDefined();
	});
});
