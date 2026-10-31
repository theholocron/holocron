import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader, type SecretScope } from "../../plugin/index.js";
import { runSecretsList } from "./secrets-list.js";
import { secretsListScopes } from "./secrets-list-scopes.js";

function loadedDemo(): LoadedConfig {
	return {
		resolved: resolveConfig({ name: "demo", providers: { secrets: "github" } }),
		filepath: "/tmp/test/holocron.config.json",
	};
}

function loaderWith(loaded: LoadedConfig, listSecrets: (scope: SecretScope) => Promise<string[]>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (pkg !== "@theholocron/holocron-plugin-github") throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return {
			createPlugin: () => ({
				name: "gh",
				capabilities: { secrets: () => ({ providerName: "github", listSecrets }) },
			}),
		} as unknown as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter);
}

const context = { repoRoot: "/tmp/test" };

describe("secretsListScopes", () => {
	it("lists the repository, then the organization and the environment that were named", () => {
		expect(secretsListScopes({})).toEqual([{ kind: "repo" }]);
		expect(secretsListScopes({ org: "acme", env: "production" })).toEqual([
			{ kind: "repo" },
			{ kind: "organization", name: "acme" },
			{ kind: "environment", name: "production" },
		]);
	});

	it("lists just the scope that was asked for", () => {
		expect(secretsListScopes({ scope: "repo", org: "acme" })).toEqual([{ kind: "repo" }]);
		expect(secretsListScopes({ scope: "environment", env: "qa" })).toEqual([{ kind: "environment", name: "qa" }]);
		expect(secretsListScopes({ scope: "organization", org: "acme" })).toEqual([
			{ kind: "organization", name: "acme" },
		]);
	});

	it("refuses an environment without --env and an organization with no name", () => {
		expect(() => secretsListScopes({ scope: "environment" })).toThrow(/--env/);
		expect(() => secretsListScopes({ scope: "organization" })).toThrow(/--org/);
	});
});

describe("runSecretsList", () => {
	it("prints the names at each scope, sorted, under a heading", async () => {
		const loaded = loadedDemo();
		const lines: string[] = [];
		const listSecrets = vi.fn(async (scope: SecretScope) =>
			scope.kind === "repo" ? ["B", "A"] : ([] as string[])
		);
		const report = await runSecretsList({
			loaded,
			context,
			loader: loaderWith(loaded, listSecrets),
			scopes: [{ kind: "repo" }, { kind: "organization", name: "acme" }],
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(lines).toEqual(["repo", "  A", "  B", "", "organization acme", "  (none)"]);
		expect(report.failed).toBe(0);
	});

	it("reports a scope it could not list, keeps listing the rest, and counts the failure", async () => {
		const loaded = loadedDemo();
		const lines: string[] = [];
		const listSecrets = vi.fn(async (scope: SecretScope) => {
			if (scope.kind === "environment") throw new Error("404 Not Found");
			return ["X"];
		});
		const report = await runSecretsList({
			loaded,
			context,
			loader: loaderWith(loaded, listSecrets),
			scopes: [{ kind: "environment", name: "qa" }, { kind: "repo" }],
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(lines).toEqual(["environment qa", "  ✗ 404 Not Found", "", "repo", "  X"]);
		expect(report.failed).toBe(1);
	});

	it("prints one JSON document with the names and the error, and no label", async () => {
		const loaded = loadedDemo();
		const lines: string[] = [];
		const listSecrets = vi.fn(async (scope: SecretScope) => {
			if (scope.kind === "organization") throw new Error("403");
			return ["A"];
		});
		await runSecretsList({
			loaded,
			context,
			loader: loaderWith(loaded, listSecrets),
			scopes: [{ kind: "repo" }, { kind: "organization", name: "acme" }],
			json: true,
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0]!)).toEqual([
			{ scope: { kind: "repo" }, names: ["A"] },
			{ scope: { kind: "organization", name: "acme" }, names: [], error: "403" },
		]);
	});

	it("throws when no `secrets` provider is configured", async () => {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { vault: "1password" } }),
			filepath: "/tmp/test/holocron.config.json",
		};
		const importer = vi.fn(async () => ({
			createPlugin: () => ({ name: "1p", capabilities: { vault: () => ({}) } }),
		}));
		const loader = new PluginLoader(loaded.resolved, context, importer as unknown as PluginImporter);
		await expect(
			runSecretsList({
				loaded,
				context,
				loader,
				scopes: [{ kind: "repo" }],
				print: () => {},
				logger: fakeLogger(),
			})
		).rejects.toThrow(/`secrets` capability is not configured/);
	});

	it("builds its own loader when none is passed", async () => {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: {} }),
			filepath: "/tmp/test/holocron.config.json",
		};
		await expect(runSecretsList({ loaded, context, scopes: [{ kind: "repo" }] })).rejects.toThrow(
			/`secrets` capability is not configured/
		);
	});

	it("prints to the console and logs to the root logger when none are passed", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const loaded = loadedDemo();
		await runSecretsList({
			loaded,
			context,
			loader: loaderWith(loaded, async () => ["A"]),
			scopes: [{ kind: "repo" }],
		});
		expect(log.mock.calls.map((c) => c[0])).toEqual(["repo", "  A"]);
		log.mockRestore();
	});
});
