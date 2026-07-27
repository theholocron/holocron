import { describe, expect, it, vi } from "vitest";

import { runDeploy } from "../commands/deploy.js";
import { resolveConfig } from "../config.js";
import type { LoadedConfig } from "../load-config.js";
import { type PluginImporter,PluginLoader } from "../loader.js";

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

describe("runDeploy", () => {
	it("triggers a deployment via the configured provider", async () => {
		const triggerCalls: Array<{ projectId: string; branch: string; target?: string }> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", {
				vault: { providerName: "1password" },
			}),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async (input: { projectId: string; branch: string; target?: string }) => {
						triggerCalls.push(input);
						return {
							id: "dpl_1",
							url: "demo-abc.vercel.app",
							branch: input.branch,
							status: "queued" as const,
						};
					},
				},
			}),
		});

		const report = await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			branch: "feat/x",
			loader,
			print: () => {},
		});

		expect(triggerCalls).toHaveLength(1);
		expect(triggerCalls[0]).toMatchObject({
			projectId: "prj_123",
			branch: "feat/x",
		});
		expect(report.status).toBe("ok");
		expect(report.deployment?.url).toBe("demo-abc.vercel.app");
	});

	it("passes named target through (production / staging)", async () => {
		const triggerCalls: Array<{ target?: string }> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async (input: { target?: string }) => {
						triggerCalls.push(input);
						return {
							id: "dpl_1",
							url: "demo.vercel.app",
							branch: "main",
							status: "queued" as const,
						};
					},
				},
			}),
		});

		await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			branch: "main",
			target: "production",
			loader,
			print: () => {},
		});

		expect(triggerCalls[0]?.target).toBe("production");
	});

	it("errors when deployment capability is not configured", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
		});

		await expect(
			runDeploy({
				loaded,
				context: { repoRoot: "/tmp/test" },
				projectId: "prj_123",
				branch: "main",
				loader,
				print: () => {},
			})
		).rejects.toThrow(/deployment capability is not configured/);
	});

	it("dry-run skips the actual triggerDeployment call", async () => {
		let called = false;
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async () => {
						called = true;
						return { id: "", url: "", branch: "", status: "queued" as const };
					},
				},
			}),
		});

		const report = await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			projectId: "prj_123",
			branch: "main",
			loader,
			print: () => {},
		});

		expect(called).toBe(false);
		expect(report.status).toBe("dry-run");
		expect(report.deployment).toBeNull();
		expect(report.message).toContain("projectId=prj_123");
	});

	it("dry-run includes target in message when target is provided", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async () => ({ id: "", url: "", branch: "", status: "queued" as const }),
				},
			}),
		});

		const report = await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			projectId: "prj_123",
			branch: "main",
			target: "production",
			loader,
			print: () => {},
		});

		expect(report.status).toBe("dry-run");
		expect(report.message).toContain("target=production");
	});

	it("returns status=fail with the error message when the provider throws", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async () => {
						throw new Error("no linked GitHub repo");
					},
				},
			}),
		});

		const report = await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			branch: "main",
			loader,
			print: () => {},
		});

		expect(report.status).toBe("fail");
		expect(report.message).toContain("no linked GitHub repo");
	});

	it("returns status=fail with string coercion when a non-Error is thrown", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async () => {
						throw "network timeout";
					},
				},
			}),
		});

		const report = await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			branch: "main",
			loader,
			print: () => {},
		});

		expect(report.status).toBe("fail");
		expect(report.message).toBe("network timeout");
	});
});
