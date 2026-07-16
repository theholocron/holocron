import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../config.js";
import { runSync } from "../commands/sync.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type PluginImporter } from "../loader.js";

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

describe("runSync", () => {
	it("runs all three sync steps when no steps filter is given", async () => {
		const called: string[] = [];
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", topics: ["ts", "cli"] },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => {
						called.push("labels");
						return "17 synced";
					},
					syncProperties: async () => {
						called.push("properties");
						return "2 properties set";
					},
					syncTopics: async (topics: string[]) => {
						called.push("topics");
						return `${topics.length} topics set`;
					},
				},
			}),
		});

		const report = await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		expect(called).toEqual(["labels", "properties", "topics"]);
		expect(report.steps).toHaveLength(3);
		expect(report.steps.every((s) => s.status === "ok")).toBe(true);
		expect(report.summary).toMatchObject({ ok: 3, fail: 0, skip: 0 });
	});

	it("runs only the requested step when a single step filter is given", async () => {
		const called: string[] = [];
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", topics: ["ts"] },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => {
						called.push("labels");
						return "17 synced";
					},
					syncProperties: async () => {
						called.push("properties");
						return "1 set";
					},
					syncTopics: async () => {
						called.push("topics");
						return "1 topics set";
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["topics"],
			print: () => {},
		});

		expect(called).toEqual(["topics"]);
		expect(report.steps).toHaveLength(1);
		expect(report.steps[0]?.step).toBe("sync topics");
		expect(report.steps[0]?.status).toBe("ok");
	});

	it("runs a subset of steps when multiple steps are requested", async () => {
		const called: string[] = [];
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", topics: ["ts"] },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => {
						called.push("labels");
						return "17 synced";
					},
					syncProperties: async () => {
						called.push("properties");
						return "1 set";
					},
					syncTopics: async () => {
						called.push("topics");
						return "1 topics set";
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["labels", "topics"],
			print: () => {},
		});

		expect(called).toEqual(["labels", "topics"]);
		expect(report.steps).toHaveLength(2);
	});

	it("reports skip for an unknown step name", async () => {
		const loaded = loadedFrom({
			project: { name: "demo" },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => "17 synced",
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["labels", "not-a-real-step"],
			print: () => {},
		});

		const unknownStep = report.steps.find((s) => s.step === "sync not-a-real-step");
		expect(unknownStep?.status).toBe("skip");
		expect(unknownStep?.message).toContain("unknown step");
		expect(report.summary.skip).toBeGreaterThanOrEqual(1);
	});

	it("dry-run does not call any sync methods", async () => {
		let called = false;
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", topics: ["ts"] },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => {
						called = true;
						return "17 synced";
					},
					syncProperties: async () => {
						called = true;
						return "1 set";
					},
					syncTopics: async () => {
						called = true;
						return "1 topics set";
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test", dryRun: true },
			loader,
			print: () => {},
		});

		expect(called).toBe(false);
		expect(report.steps.every((s) => s.status === "dry-run")).toBe(true);
		expect(report.summary.dryRun).toBe(3);
	});

	it("reports skip when provider does not implement syncLabels", async () => {
		const loaded = loadedFrom({
			project: { name: "demo" },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					// syncLabels intentionally omitted
					syncProperties: async () => "1 set",
					syncTopics: async () => "0 topics set",
				},
			}),
		});

		const report = await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "sync labels");
		expect(step?.status).toBe("skip");
		expect(step?.message).toContain("does not implement syncLabels");
	});

	it("reports skip when provider does not implement syncProperties", async () => {
		const loaded = loadedFrom({
			project: { name: "demo" },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => "17 synced",
					// syncProperties intentionally omitted
					syncTopics: async () => "0 topics set",
				},
			}),
		});

		const report = await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "sync properties");
		expect(step?.status).toBe("skip");
		expect(step?.message).toContain("does not implement syncProperties");
	});

	it("skips syncTopics with 'no topics configured' when topics list is absent", async () => {
		let called = false;
		const loaded = loadedFrom({
			project: { name: "demo" },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncTopics: async () => {
						called = true;
						return "0 topics set";
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["topics"],
			print: () => {},
		});

		expect(called).toBe(false);
		const step = report.steps.find((s) => s.step === "sync topics");
		expect(step?.status).toBe("skip");
		expect(step?.message).toBe("no topics configured");
	});

	it("skips syncTopics with 'no topics configured' when topics list is empty", async () => {
		let called = false;
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", topics: [] },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncTopics: async () => {
						called = true;
						return "0 topics set";
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["topics"],
			print: () => {},
		});

		expect(called).toBe(false);
		const step = report.steps.find((s) => s.step === "sync topics");
		expect(step?.status).toBe("skip");
		expect(step?.message).toBe("no topics configured");
	});

	it("reports skip when provider does not implement syncTopics (topics configured)", async () => {
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", topics: ["ts"] },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => "17 synced",
					syncProperties: async () => "1 set",
					// syncTopics intentionally omitted
				},
			}),
		});

		const report = await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "sync topics");
		expect(step?.status).toBe("skip");
		expect(step?.message).toContain("does not implement syncTopics");
	});

	it("passes the configured topics to syncTopics", async () => {
		let capturedTopics: string[] | null = null;
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", topics: ["cli", "nodejs", "typescript"] },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncTopics: async (topics: string[]) => {
						capturedTopics = topics;
						return `${topics.length} topics set`;
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["topics"],
			print: () => {},
		});

		expect(capturedTopics).toEqual(["cli", "nodejs", "typescript"]);
		const step = report.steps.find((s) => s.step === "sync topics");
		expect(step?.status).toBe("ok");
		expect(step?.message).toBe("3 topics set");
	});

	it("passes manual and derived properties to syncProperties", async () => {
		let captured: Record<string, string> | null = null;
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: {
					name: "theholocron/demo",
					properties: {
						lifecycle: "active",
						open_source: true,
						runtime_environment: "node",
						uses_external_packages: false,
					},
				},
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncProperties: async (values: Record<string, string>) => {
						captured = values;
						return `${Object.keys(values).length} properties set`;
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["properties"],
			print: () => {},
		});

		expect(captured).not.toBeNull();
		// derived: monorepo always present; branch_protection_level absent when protection unset
		expect(captured!["monorepo"]).toBe("false"); // /tmp/test has no pnpm-workspace.yaml
		expect(captured!["branch_protection_level"]).toBeUndefined();
		// manual properties
		expect(captured!["lifecycle"]).toBe("active");
		expect(captured!["open_source"]).toBe("true");
		expect(captured!["runtime_environment"]).toBe("node");
		expect(captured!["uses_external_packages"]).toBe("false");
		const step = report.steps.find((s) => s.step === "sync properties");
		expect(step?.status).toBe("ok");
	});

	it("includes branch_protection_level when repo.protection is set", async () => {
		let captured: Record<string, string> | null = null;
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", protection: "strict" },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncProperties: async (values: Record<string, string>) => {
						captured = values;
						return `${Object.keys(values).length} properties set`;
					},
				},
			}),
		});

		await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, steps: ["properties"], print: () => {} });

		expect(captured!["branch_protection_level"]).toBe("strict");
		expect(captured!["monorepo"]).toBe("false");
	});

	it("omits branch_protection_level when repo.protection is 'none'", async () => {
		let captured: Record<string, string> | null = null;
		const loaded = loadedFrom({
			project: {
				name: "demo",
				repo: { name: "theholocron/demo", protection: "none" },
			},
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncProperties: async (values: Record<string, string>) => {
						captured = values;
						return `${Object.keys(values).length} properties set`;
					},
				},
			}),
		});

		await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, steps: ["properties"], print: () => {} });

		expect(captured!["branch_protection_level"]).toBeUndefined();
		expect(captured!["monorepo"]).toBe("false");
	});

	it("output includes a header and summary line", async () => {
		const lines: string[] = [];
		const loaded = loadedFrom({
			project: { name: "demo" },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => "17 synced",
					syncProperties: async () => "1 set",
					syncTopics: async () => "0 topics set",
				},
			}),
		});

		await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: (l) => lines.push(l) });

		const joined = lines.join("\n");
		expect(joined).toMatch(/Holocron sync — demo/);
		expect(joined).toMatch(/ok, \d+ fail/);
	});

	it("marks step as fail when syncLabels throws", async () => {
		const loaded = loadedFrom({
			project: { name: "demo" },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncLabels: async () => {
						throw new Error("API rate limit");
					},
					syncProperties: async () => "1 set",
					syncTopics: async () => "0 topics set",
				},
			}),
		});

		const report = await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "sync labels");
		expect(step?.status).toBe("fail");
		expect(step?.message).toContain("API rate limit");
		expect(report.summary.fail).toBe(1);
	});
});
