import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { AuthError, resolveApiToken, resolveToken, tokens } from "./auth.js";
import { createPlugin } from "./index.js";

describe("tokens export", () => {
	it("declares the upload token and the optional API token for the ci layer only", () => {
		expect(tokens).toEqual([
			{
				envName: "HOLOCRON_CODECOV_UPLOAD_TOKEN",
				vendorEnvName: "CODECOV_TOKEN",
				keyringKey: "codecov.upload",
				expect: { layers: ["ci"] },
			},
			{
				envName: "HOLOCRON_CODECOV_API_TOKEN",
				keyringKey: "codecov.api",
				optional: true,
				expect: { layers: ["dev", "ci"] },
			},
		]);
	});
});

describe("resolveApiToken", () => {
	it("reads HOLOCRON_CODECOV_API_TOKEN or the codecov.api keyring entry, never the upload token", () => {
		expect(resolveApiToken({ env: { HOLOCRON_CODECOV_API_TOKEN: "api" }, keyring: () => null })).toBe("api");
		expect(resolveApiToken({ env: {}, keyring: (a) => (a === "codecov.api" ? "kr" : null) })).toBe("kr");
		expect(() =>
			resolveApiToken({
				env: { HOLOCRON_CODECOV_UPLOAD_TOKEN: "upload", CODECOV_TOKEN: "upload" },
				keyring: () => null,
			})
		).toThrow(/HOLOCRON_CODECOV_API_TOKEN/);
	});
});

describe("resolveToken", () => {
	const noKeyring = () => null;

	it("prefers --token, then HOLOCRON_CODECOV_UPLOAD_TOKEN, then CODECOV_TOKEN, then the keyring", () => {
		const env = { HOLOCRON_CODECOV_UPLOAD_TOKEN: "hlc", CODECOV_TOKEN: "vendor" };
		expect(resolveToken({ cliToken: "flag", env, keyring: noKeyring })).toBe("flag");
		expect(resolveToken({ env, keyring: noKeyring })).toBe("hlc");
		expect(resolveToken({ env: { CODECOV_TOKEN: "vendor" }, keyring: noKeyring })).toBe("vendor");
		expect(resolveToken({ env: {}, keyring: (a) => (a === "codecov.upload" ? "kr" : null) })).toBe("kr");
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
		expect((err as AuthError).message).toMatch(/HOLOCRON_CODECOV_UPLOAD_TOKEN \/ CODECOV_TOKEN/);
	});
});

describe("createPlugin", () => {
	it("returns a plugin with a coverage capability and token and connection probes", () => {
		const plugin = createPlugin({ cliToken: "t", env: {} });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-codecov");
		const cap = plugin.capabilities.coverage();
		expect(cap.key).toBe("coverage");
		expect(cap.providerName).toBe("codecov");
		expect(Object.keys(plugin.probes).sort()).toEqual(["connection", "repo", "token"]);
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

	it("its repo probe compares the expected names with Codecov using the API token, not the upload token", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { next: null, results: [{ flag_name: "a" }, { flag_name: "stray" }] } },
			{ body: [{ component_id: "a", name: "a" }] },
		]);
		const plugin = createPlugin({
			cliToken: "upload",
			env: { HOLOCRON_CODECOV_API_TOKEN: "api" },
			keyring: () => null,
			repo: "a/b",
			fetch,
			expected: () => ({ flags: ["a", "b"], components: ["a"] }),
		});
		const rows: Array<{ status: string; label: string }> = [];
		await plugin.probes.repo.run({
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(calls.every((c) => c.headers.authorization === "Bearer api")).toBe(true);
		expect(rows).toEqual([
			{ status: "ok", label: "components", detail: "1 declared, all on Codecov for a/b" },
			{ status: "info", label: "flag b", detail: expect.any(String) },
			{ status: "info", label: "flag stray", detail: expect.any(String) },
		]);
	});

	it("its repo probe reads the workspace when no expected lists are given, and says which variable to set without a token", async () => {
		const plugin = createPlugin({ env: {}, keyring: () => null, repo: "a/b", repoRoot: process.cwd() });
		const rows: Array<{ status: string; label: string; detail?: string }> = [];
		await plugin.probes.repo.run({
			dryRun: false,
			say: (r) => void rows.push(r),
			secret: () => {},
			write: async () => undefined,
			cleanup: () => {},
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe("info");
		expect(rows[0]?.detail).toContain("HOLOCRON_CODECOV_API_TOKEN");
	});

	it("its connection probe only checks a token is set and never asks Codecov", async () => {
		const plugin = createPlugin({ cliToken: "t", env: {} });
		expect(plugin.probes.connection).toBeDefined();
	});
});
