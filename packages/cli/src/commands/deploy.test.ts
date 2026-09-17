import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../config/config.js";
import type { LoadedConfig } from "../config/load-config.js";
import { type PluginImporter, PluginLoader } from "../plugin/loader.js";
import { runDeploy, runDeployFromFiles } from "./deploy.js";

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

		const log = fakeLogger();
		const report = await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			branch: "feat/x",
			loader,
			print: () => {},
			logger: log,
		});

		expect(triggerCalls).toHaveLength(1);
		expect(triggerCalls[0]).toMatchObject({
			projectId: "prj_123",
			branch: "feat/x",
		});
		expect(report.status).toBe("ok");
		expect(report.deployment?.url).toBe("demo-abc.vercel.app");

		expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ branch: "feat/x" }), "deploy: start");
		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ status: "queued", url: "demo-abc.vercel.app" }),
			"deploy: triggered"
		);
	});

	it("prints the success URL with an https:// scheme (provider returns a bare hostname)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async () => ({
						id: "dpl_1",
						url: "demo-abc.vercel.app",
						branch: "main",
						status: "queued" as const,
					}),
				},
			}),
		});

		const lines: string[] = [];
		await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			branch: "main",
			loader,
			print: (line) => lines.push(line),
		});

		expect(lines.some((l) => l.includes("https://demo-abc.vercel.app"))).toBe(true);
	});

	it("leaves an already-schemed URL untouched", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					triggerDeployment: async () => ({
						id: "dpl_1",
						url: "https://demo-abc.vercel.app",
						branch: "main",
						status: "queued" as const,
					}),
				},
			}),
		});

		const lines: string[] = [];
		await runDeploy({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			branch: "main",
			loader,
			print: (line) => lines.push(line),
		});

		expect(lines.some((l) => l.includes("https://https://"))).toBe(false);
		expect(lines.some((l) => l.includes("https://demo-abc.vercel.app"))).toBe(true);
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

describe("runDeployFromFiles", () => {
	function fakeFs(files: Record<string, string>) {
		const walkFiles = (dir: string) => Object.keys(files).map((rel) => `${dir}/${rel}`);
		const readFile = (abs: string) => {
			for (const [rel, content] of Object.entries(files)) {
				if (abs.endsWith(rel)) return content;
			}
			throw new Error(`unexpected read: ${abs}`);
		};
		return { walkFiles, readFile };
	}

	it("deploys the walked files via the configured provider's deployFunction", async () => {
		const deployCalls: Array<{ projectId: string; config: { files: Record<string, string>; target?: string } }> =
			[];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					deployFunction: async (projectId: string, config: { files: Record<string, string> }) => {
						deployCalls.push({ projectId, config });
						return { deploymentId: "dpl_1", url: "sentinel-abc.vercel.app" };
					},
				},
			}),
		});

		const log = fakeLogger();
		const { walkFiles, readFile } = fakeFs({ "api/webhook.js": "export default () => {};" });
		const report = await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			dir: "/tmp/sentinel-dist",
			loader,
			print: () => {},
			logger: log,
			walkFiles,
			readFile,
		});

		expect(deployCalls).toHaveLength(1);
		expect(deployCalls[0]?.projectId).toBe("prj_123");
		expect(deployCalls[0]?.config.files).toEqual({ "api/webhook.js": "export default () => {};" });
		expect(report.status).toBe("ok");
		expect(report.deployment).toEqual({ deploymentId: "dpl_1", url: "sentinel-abc.vercel.app" });
		expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ fileCount: 1 }), "deploy: start (files)");
	});

	it("prints the success URL with an https:// scheme (provider returns a bare hostname)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					deployFunction: async () => ({ deploymentId: "dpl_1", url: "sentinel-abc.vercel.app" }),
				},
			}),
		});

		const lines: string[] = [];
		const { walkFiles, readFile } = fakeFs({ "index.js": "x" });
		await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			dir: "/tmp/dist",
			loader,
			print: (line) => lines.push(line),
			walkFiles,
			readFile,
		});

		expect(lines.some((l) => l.includes("https://sentinel-abc.vercel.app"))).toBe(true);
	});

	it("passes named target through", async () => {
		const deployCalls: Array<{ target?: string }> = [];
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					deployFunction: async (_projectId: string, config: { target?: string }) => {
						deployCalls.push(config);
						return { deploymentId: "dpl_1", url: "x" };
					},
				},
			}),
		});

		const { walkFiles, readFile } = fakeFs({ "index.js": "x" });
		await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			dir: "/tmp/dist",
			target: "production",
			loader,
			print: () => {},
			walkFiles,
			readFile,
		});

		expect(deployCalls[0]?.target).toBe("production");
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
			runDeployFromFiles({
				loaded,
				context: { repoRoot: "/tmp/test" },
				projectId: "prj_123",
				dir: "/tmp/dist",
				loader,
				print: () => {},
				walkFiles: () => [],
				readFile: () => "",
			})
		).rejects.toThrow(/deployment capability is not configured/);
	});

	it("errors clearly when the configured provider has no deployFunction", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "cloudflare" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-cloudflare": makePlugin("cloudflare", {
				deployment: { providerName: "cloudflare" },
			}),
		});

		await expect(
			runDeployFromFiles({
				loaded,
				context: { repoRoot: "/tmp/test" },
				projectId: "prj_123",
				dir: "/tmp/dist",
				loader,
				print: () => {},
				walkFiles: () => [],
				readFile: () => "",
			})
		).rejects.toThrow(/does not support deploying from files/);
	});

	it("dry-run skips the actual deployFunction call", async () => {
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
					deployFunction: async () => {
						called = true;
						return { deploymentId: "", url: "" };
					},
				},
			}),
		});

		const { walkFiles, readFile } = fakeFs({ "index.js": "x" });
		const report = await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			projectId: "prj_123",
			dir: "/tmp/dist",
			loader,
			print: () => {},
			walkFiles,
			readFile,
		});

		expect(called).toBe(false);
		expect(report.status).toBe("dry-run");
		expect(report.deployment).toBeNull();
		expect(report.message).toContain("files=1");
	});

	it("dry-run message includes target when provided", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: { providerName: "vercel", deployFunction: async () => ({ deploymentId: "", url: "" }) },
			}),
		});

		const { walkFiles, readFile } = fakeFs({ "index.js": "x" });
		const report = await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			projectId: "prj_123",
			dir: "/tmp/dist",
			target: "production",
			loader,
			print: () => {},
			walkFiles,
			readFile,
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
					deployFunction: async () => {
						throw new Error("invalid files array");
					},
				},
			}),
		});

		const { walkFiles, readFile } = fakeFs({ "index.js": "x" });
		const report = await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			dir: "/tmp/dist",
			loader,
			print: () => {},
			walkFiles,
			readFile,
		});

		expect(report.status).toBe("fail");
		expect(report.message).toContain("invalid files array");
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
					deployFunction: async () => {
						throw "network timeout";
					},
				},
			}),
		});

		const { walkFiles, readFile } = fakeFs({ "index.js": "x" });
		const report = await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			dir: "/tmp/dist",
			loader,
			print: () => {},
			walkFiles,
			readFile,
		});

		expect(report.status).toBe("fail");
		expect(report.message).toBe("network timeout");
	});

	it("defaults print to console.log when omitted", async () => {
		const loaded = loadedFrom({
			name: "demo",
			providers: { vault: "1password", deployment: "vercel" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
			"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
				deployment: {
					providerName: "vercel",
					deployFunction: async () => ({ deploymentId: "dpl_1", url: "x" }),
				},
			}),
		});
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const { walkFiles, readFile } = fakeFs({ "index.js": "x" });
		const report = await runDeployFromFiles({
			loaded,
			context: { repoRoot: "/tmp/test" },
			projectId: "prj_123",
			dir: "/tmp/dist",
			loader,
			walkFiles,
			readFile,
		});

		expect(report.status).toBe("ok");
		expect(logSpy).toHaveBeenCalled();
		logSpy.mockRestore();
	});

	describe("default walkFiles/readFile (real filesystem)", () => {
		let dir: string;

		afterEach(() => {
			if (dir) rmSync(dir, { recursive: true, force: true });
		});

		it("recursively reads real files (including a dist/ subdir — not skipped, unlike holocron new's walker), skipping .git/node_modules/.turbo, keyed relative + POSIX-separated", async () => {
			dir = mkdtempSync(join(tmpdir(), "holocron-deploy-test-"));
			mkdirSync(join(dir, "api"), { recursive: true });
			mkdirSync(join(dir, "dist"), { recursive: true });
			mkdirSync(join(dir, "node_modules", "x"), { recursive: true });
			mkdirSync(join(dir, ".git"), { recursive: true });
			writeFileSync(join(dir, "api", "webhook.js"), "export default () => {};");
			writeFileSync(join(dir, "dist", "index.mjs"), "export const handleWebhookRequest = () => {};");
			writeFileSync(join(dir, "package.json"), "{}");
			writeFileSync(join(dir, "node_modules", "x", "index.js"), "should be skipped");
			writeFileSync(join(dir, ".git", "HEAD"), "should be skipped");

			const deployCalls: Array<{ files: Record<string, string> }> = [];
			const loaded = loadedFrom({
				name: "demo",
				providers: { vault: "1password", deployment: "vercel" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-1password": makePlugin("1p", { vault: {} }),
				"@theholocron/holocron-plugin-vercel": makePlugin("vercel", {
					deployment: {
						providerName: "vercel",
						deployFunction: async (_projectId: string, config: { files: Record<string, string> }) => {
							deployCalls.push(config);
							return { deploymentId: "dpl_1", url: "x" };
						},
					},
				}),
			});

			const report = await runDeployFromFiles({
				loaded,
				context: { repoRoot: "/tmp/test" },
				projectId: "prj_123",
				dir,
				loader,
				print: () => {},
			});

			expect(report.status).toBe("ok");
			expect(deployCalls[0]?.files).toEqual({
				"api/webhook.js": "export default () => {};",
				"dist/index.mjs": "export const handleWebhookRequest = () => {};",
				"package.json": "{}",
			});
		});
	});
});
