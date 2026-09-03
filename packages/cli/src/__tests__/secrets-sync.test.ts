import { describe, expect, it, vi } from "vitest";

import { runSecretsSync } from "../commands/secrets-sync.js";
import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import { type PluginImporter, PluginLoader } from "../loader.js";

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
	return {
		resolved: resolveConfig(rawConfig),
		filepath: "/tmp/test/holocron.config.json",
	};
}

function makePlugin(name: string, caps: Record<string, unknown>) {
	return {
		createPlugin: (_opts: Record<string, unknown>) => ({
			name,
			capabilities: Object.fromEntries(Object.entries(caps).map(([k, impl]) => [k, () => impl])),
		}),
	};
}

function makeLoaderWith(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
	const importer = vi.fn(async (pkg: string) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg] as Awaited<ReturnType<PluginImporter>>;
	});
	return new PluginLoader(
		loaded.resolved,
		{ repoRoot: "/tmp/test", repo: "theholocron/holocron" },
		importer as unknown as PluginImporter
	);
}

describe("runSecretsSync", () => {
	it("errors when the vault provider does not implement readEnvironment", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				// No readEnvironment method
				vault: { providerName: "1password", list: async () => [] },
			}),
		});

		await expect(
			runSecretsSync({
				loaded,
				context: { repoRoot: "/tmp/test" },
				environmentId: "env_1",
				loader,
				print: () => {},
			})
		).rejects.toThrow(/readEnvironment/);
	});

	it("fans out vault keys to secrets (repo scope)", async () => {
		const setSecretCalls: Array<{ name: string; value: string }> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async (_id: string) => ({
						CLERK_SECRET_KEY: "sk_test_xxx",
						NEON_DATABASE_URL: "postgresql://...",
					}),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string, value: string) => {
						setSecretCalls.push({ name, value });
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		expect(setSecretCalls).toHaveLength(2);
		expect(setSecretCalls.map((c) => c.name).sort()).toEqual(["CLERK_SECRET_KEY", "NEON_DATABASE_URL"]);
		expect(report.summary.ok).toBe(2);
		expect(report.summary.fail).toBe(0);
	});

	it("skips deployment sync when projectId is missing", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ A: "a" }),
				},
			}),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					setEnvVar: async () => {
						throw new Error("should not be called when projectId is missing");
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		const skipped = report.rows.filter((r) => r.status === "skip");
		expect(skipped.length).toBeGreaterThan(0);
		expect(skipped[0]?.message).toMatch(/projectId/);
	});

	it("fans out to deployment env vars for each target when projectId is provided", async () => {
		const setEnvCalls: Array<{
			projectId: string;
			target: string;
			name: string;
			value: string;
		}> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ KEY_A: "a", KEY_B: "b" }),
				},
			}),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					setEnvVar: async (projectId: string, target: string, name: string, value: string) => {
						setEnvCalls.push({ projectId, target, name, value });
					},
				},
			}),
		});

		await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			projectId: "prj_123",
			targets: ["production", "preview"],
			loader,
			print: () => {},
		});

		expect(setEnvCalls).toHaveLength(4); // 2 keys × 2 targets
		expect(new Set(setEnvCalls.map((c) => c.target))).toEqual(new Set(["production", "preview"]));
		expect(setEnvCalls.every((c) => c.projectId === "prj_123")).toBe(true);
	});

	it("dry-run reports `dry-run` rows without calling mutators", async () => {
		let called = false;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ X: "x" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async () => {
						called = true;
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		expect(called).toBe(false);
		expect(report.rows.every((r) => r.status === "dry-run")).toBe(true);
		expect(report.summary.dryRun).toBe(1);
	});

	it("soft-skips with string coercion when provider throws a non-Error", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ KEY: "value" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async () => {
						throw "403 forbidden string";
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		expect(report.summary.fail).toBe(1);
		const failedRow = report.rows.find((r) => r.status === "fail");
		expect(failedRow?.message).toBe("403 forbidden string");
	});

	it("soft-skips individual key failures (continues with other keys)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", secrets: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: {
					providerName: "1password",
					readEnvironment: async () => ({ GOOD: "g", BAD: "b", ALSO_GOOD: "g2" }),
				},
			}),
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				secrets: {
					providerName: "github",
					setSecret: async (_scope: unknown, name: string) => {
						if (name === "BAD") throw new Error("403 forbidden");
					},
				},
			}),
		});

		const report = await runSecretsSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			environmentId: "env_1",
			loader,
			print: () => {},
		});

		expect(report.summary.ok).toBe(2);
		expect(report.summary.fail).toBe(1);
		const failedRow = report.rows.find((r) => r.status === "fail");
		expect(failedRow?.key).toBe("BAD");
		expect(failedRow?.message).toContain("403 forbidden");
	});
});
