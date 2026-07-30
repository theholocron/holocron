import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "../auth-resolver.js";
import { runSync } from "../commands/sync.js";
import { resolveConfig } from "../config.js";
import type { LoadedConfig } from "../load-config.js";
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

describe("runSync", () => {
	it("runs all sync steps when no steps filter is given", async () => {
		const called: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			description: "A demo CLI tool",
			repo: { name: "theholocron/demo", topics: ["ts", "cli"] },
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
		expect(report.steps).toHaveLength(7);
		expect(report.steps.filter((s) => s.status === "ok")).toHaveLength(5);
		expect(report.steps.find((s) => s.step === "sync teams")?.status).toBe("skip");
		expect(report.summary).toMatchObject({ ok: 5, fail: 0, skip: 2 });
	});

	it("runs only the requested step when a single step filter is given", async () => {
		const called: string[] = [];
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", topics: ["ts"] },
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
			name: "demo",
			repo: { name: "theholocron/demo", topics: ["ts"] },
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
			name: "demo",
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
			name: "demo",
			description: "A demo CLI tool",
			repo: { name: "theholocron/demo", topics: ["ts"] },
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
		expect(report.steps.every((s) => s.status === "dry-run" || s.status === "skip")).toBe(true);
		expect(report.summary.dryRun).toBe(5);
	});

	it("reports skip when provider does not implement syncLabels", async () => {
		const loaded = loadedFrom({
			name: "demo",
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
			name: "demo",
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
			name: "demo",
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
			name: "demo",
			repo: { name: "theholocron/demo", topics: [] },
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
			name: "demo",
			repo: { name: "theholocron/demo", topics: ["ts"] },
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
			name: "demo",
			repo: { name: "theholocron/demo", topics: ["cli", "nodejs", "typescript"] },
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

	it("passes the configured teams to syncTeams", async () => {
		let capturedTeams: unknown = null;
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", teams: ["gatekeepers"] },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncTeams: async (teams: unknown[]) => {
						capturedTeams = teams;
						return "1 team synced";
					},
					writeRepoFile: async (path: string, content: string) => {
						written[path] = content;
					},
				},
			}),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test", repo: "theholocron/demo" },
			loader,
			steps: ["teams"],
			print: () => {},
		});

		expect(capturedTeams).toEqual(["gatekeepers"]);
		const step = report.steps.find((s) => s.step === "sync teams");
		expect(step?.status).toBe("ok");
		expect(step?.message).toBe("1 team synced");
		expect(written[".github/CODEOWNERS"]).toBe("* @theholocron/gatekeepers\n");
	});

	it("reports skip when provider does not implement syncTeams (teams configured)", async () => {
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", teams: ["gatekeepers"] },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					// syncTeams intentionally omitted
				},
			}),
		});

		const report = await runSync({ loaded, context: { repoRoot: "/tmp/test" }, loader, print: () => {} });

		const step = report.steps.find((s) => s.step === "sync teams");
		expect(step?.status).toBe("skip");
		expect(step?.message).toContain("does not implement syncTeams");
	});

	it("skips CODEOWNERS in sync when all teams have read-only permission", async () => {
		const written: Record<string, string> = {};
		const loaded = loadedFrom({
			name: "demo",
			repo: { name: "theholocron/demo", teams: [{ slug: "readers", permission: "pull" as const }] },
			providers: { source: "github" },
		});
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", {
				source: {
					syncTeams: async () => "1 team synced",
					writeRepoFile: async (path: string, content: string) => {
						written[path] = content;
					},
				},
			}),
		});

		await runSync({
			loaded,
			context: { repoRoot: "/tmp/test", repo: "theholocron/demo" },
			loader,
			steps: ["teams"],
			print: () => {},
		});

		expect(written[".github/CODEOWNERS"]).toBeUndefined();
	});

	it("skips sync keywords when no topics are configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["keywords"],
			print: () => {},
		});

		const step = report.steps.find((s) => s.step === "sync keywords");
		expect(step?.status).toBe("skip");
		expect(step?.message).toBe("no topics configured");
	});

	it("skips sync keywords when topics list is empty", async () => {
		const loaded = loadedFrom({ name: "demo", repo: { topics: [] }, providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["keywords"],
			print: () => {},
		});

		const step = report.steps.find((s) => s.step === "sync keywords");
		expect(step?.status).toBe("skip");
		expect(step?.message).toBe("no topics configured");
	});

	describe("sync keywords — package.json write", () => {
		let tmpDir: string;
		beforeEach(async () => {
			tmpDir = await mkdtemp(join(tmpdir(), "holocron-test-"));
		});
		afterEach(async () => {
			await rm(tmpDir, { recursive: true });
		});

		it("writes topics to package.json#keywords", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ name: "demo", keywords: [] }, null, 2) + "\n"
			);
			const loaded = loadedFrom({
				name: "demo",
				repo: { topics: ["cli", "typescript"] },
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			const report = await runSync({
				loaded,
				context: { repoRoot: tmpDir },
				loader,
				steps: ["keywords"],
				print: () => {},
			});

			const step = report.steps.find((s) => s.step === "sync keywords");
			expect(step?.status).toBe("ok");
			expect(step?.message).toContain("2 keywords written");
			const pkg = JSON.parse(await readFile(join(tmpDir, "package.json"), "utf8")) as { keywords: string[] };
			expect(pkg.keywords).toEqual(["cli", "typescript"]);
		});

		it("succeeds gracefully when package.json is absent", async () => {
			const loaded = loadedFrom({
				name: "demo",
				repo: { topics: ["cli"] },
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			const report = await runSync({
				loaded,
				context: { repoRoot: tmpDir },
				loader,
				steps: ["keywords"],
				print: () => {},
			});

			const step = report.steps.find((s) => s.step === "sync keywords");
			expect(step?.status).toBe("ok");
			expect(step?.message).toContain("no package.json");
		});

		it("still writes keywords when loader.load() throws AuthError (no provider token)", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ name: "demo", keywords: [] }, null, 2) + "\n"
			);
			const loaded = loadedFrom({
				name: "demo",
				repo: { topics: ["cli", "typescript"] },
				providers: { source: "github" },
			});
			// Importer throws AuthError — simulates missing provider token.
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": {
					createPlugin: () => {
						throw new AuthError("no GitHub token found");
					},
				},
			});

			const report = await runSync({
				loaded,
				context: { repoRoot: tmpDir },
				loader,
				steps: ["keywords"],
				print: () => {},
			});

			const step = report.steps.find((s) => s.step === "sync keywords");
			expect(step?.status).toBe("ok");
			expect(step?.message).toContain("2 keywords written");
			const pkg = JSON.parse(await readFile(join(tmpDir, "package.json"), "utf8")) as { keywords: string[] };
			expect(pkg.keywords).toEqual(["cli", "typescript"]);
		});

		it("re-throws non-AuthError load failures even for local-only steps", async () => {
			const loaded = loadedFrom({
				name: "demo",
				repo: { topics: ["cli"] },
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": {
					createPlugin: () => {
						throw new Error("plugin package corrupted");
					},
				},
			});

			await expect(
				runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["keywords"], print: () => {} })
			).rejects.toThrow();
		});
	});

	it("skips sync description when no description is configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["description"],
			print: () => {},
		});

		const step = report.steps.find((s) => s.step === "sync description");
		expect(step?.status).toBe("skip");
		expect(step?.message).toBe("no description configured");
	});

	describe("sync description — file writes and GitHub sync", () => {
		let tmpDir: string;
		beforeEach(async () => {
			tmpDir = await mkdtemp(join(tmpdir(), "holocron-test-"));
		});
		afterEach(async () => {
			await rm(tmpDir, { recursive: true });
		});

		it("writes description to package.json#description", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ name: "demo", description: "" }, null, 2) + "\n"
			);
			const loaded = loadedFrom({ name: "demo", description: "A great tool", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });

			const pkg = JSON.parse(await readFile(join(tmpDir, "package.json"), "utf8")) as { description: string };
			expect(pkg.description).toBe("A great tool");
		});

		it("replaces description within existing marker block", async () => {
			const initial =
				"# Demo\n\n<!-- holocron:description -->\nOld description.\n<!-- /holocron:description -->\n\n## Usage\n";
			await writeFile(join(tmpDir, "README.md"), initial);
			const loaded = loadedFrom({
				name: "demo",
				description: "New description.",
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });

			const readme = await readFile(join(tmpDir, "README.md"), "utf8");
			expect(readme).toContain("New description.");
			expect(readme).not.toContain("Old description.");
			expect(readme).toContain("## Usage");
		});

		it("marker block update is idempotent across multiple syncs", async () => {
			const initial =
				"# Demo\n\n<!-- holocron:description -->\nFirst.\n<!-- /holocron:description -->\n\n## Usage\n";
			await writeFile(join(tmpDir, "README.md"), initial);
			const loaded = loadedFrom({ name: "demo", description: "Second.", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });
			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });

			const readme = await readFile(join(tmpDir, "README.md"), "utf8");
			expect(readme.match(/<!-- holocron:description -->/g)).toHaveLength(1);
			expect(readme).toContain("Second.");
		});

		it("inserts marker block after H1 when no block exists", async () => {
			await writeFile(join(tmpDir, "README.md"), "# Demo\n\n## Usage\n");
			const loaded = loadedFrom({
				name: "demo",
				description: "A new description.",
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });

			const readme = await readFile(join(tmpDir, "README.md"), "utf8");
			expect(readme).toContain("<!-- holocron:description -->");
			expect(readme).toContain("A new description.");
			expect(readme).toContain("<!-- /holocron:description -->");
			expect(readme).toContain("## Usage");
		});

		it("does nothing when start marker exists but end marker is missing", async () => {
			const initial = "# Demo\n\n<!-- holocron:description -->\nOrphaned content.\n\n## Usage\n";
			await writeFile(join(tmpDir, "README.md"), initial);
			const loaded = loadedFrom({ name: "demo", description: "My tool.", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });

			const readme = await readFile(join(tmpDir, "README.md"), "utf8");
			expect(readme).toBe(initial);
		});

		it("does nothing when end marker appears before start marker", async () => {
			const initial =
				"# Demo\n\n<!-- /holocron:description -->\nContent.\n<!-- holocron:description -->\n\n## Usage\n";
			await writeFile(join(tmpDir, "README.md"), initial);
			const loaded = loadedFrom({ name: "demo", description: "My tool.", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });

			const readme = await readFile(join(tmpDir, "README.md"), "utf8");
			expect(readme).toBe(initial);
		});

		it("does not overwrite badge lines immediately after H1", async () => {
			const initial = "# Demo\n\n[![Build](https://img.shields.io/ci)](https://ci.example.com)\n\n## Usage\n";
			await writeFile(join(tmpDir, "README.md"), initial);
			const loaded = loadedFrom({ name: "demo", description: "My tool.", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["description"], print: () => {} });

			const readme = await readFile(join(tmpDir, "README.md"), "utf8");
			expect(readme).toContain("[![Build]");
			expect(readme).toContain("My tool.");
			expect(readme).toContain("<!-- holocron:description -->");
		});

		it("calls source.syncDescription when provider implements it", async () => {
			let capturedDesc: string | null = null;
			const loaded = loadedFrom({ name: "demo", description: "A great tool", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", {
					source: {
						syncDescription: async (desc: string) => {
							capturedDesc = desc;
							return "description updated";
						},
					},
				}),
			});

			const report = await runSync({
				loaded,
				context: { repoRoot: tmpDir },
				loader,
				steps: ["description"],
				print: () => {},
			});

			expect(capturedDesc).toBe("A great tool");
			const step = report.steps.find((s) => s.step === "sync description");
			expect(step?.status).toBe("ok");
			expect(step?.message).toContain("GitHub");
		});

		it("skips README.md update when file has no H1 heading", async () => {
			await writeFile(join(tmpDir, "README.md"), "No heading here.\n\n## Usage\n");
			const loaded = loadedFrom({ name: "demo", description: "A great tool", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			const report = await runSync({
				loaded,
				context: { repoRoot: tmpDir },
				loader,
				steps: ["description"],
				print: () => {},
			});

			const step = report.steps.find((s) => s.step === "sync description");
			expect(step?.status).toBe("ok");
			const readme = await readFile(join(tmpDir, "README.md"), "utf8");
			expect(readme).not.toContain("A great tool");
		});

		it("step reports ok even when package.json and README.md are absent", async () => {
			const loaded = loadedFrom({ name: "demo", description: "A great tool", providers: { source: "github" } });
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			const report = await runSync({
				loaded,
				context: { repoRoot: tmpDir },
				loader,
				steps: ["description"],
				print: () => {},
			});

			const step = report.steps.find((s) => s.step === "sync description");
			expect(step?.status).toBe("ok");
		});
	});

	it("skips sync homepage when no homepage is configured", async () => {
		const loaded = loadedFrom({ name: "demo", providers: { source: "github" } });
		const loader = makeLoaderWith(loaded, {
			"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
		});

		const report = await runSync({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader,
			steps: ["homepage"],
			print: () => {},
		});

		const step = report.steps.find((s) => s.step === "sync homepage");
		expect(step?.status).toBe("skip");
		expect(step?.message).toBe("no homepage configured");
	});

	describe("sync homepage — file writes and GitHub sync", () => {
		let tmpDir: string;
		beforeEach(async () => {
			tmpDir = await mkdtemp(join(tmpdir(), "holocron-test-"));
		});
		afterEach(async () => {
			await rm(tmpDir, { recursive: true });
		});

		it("writes homepage to package.json#homepage", async () => {
			await writeFile(
				join(tmpDir, "package.json"),
				JSON.stringify({ name: "demo", homepage: "" }, null, 2) + "\n"
			);
			const loaded = loadedFrom({
				name: "demo",
				homepage: "https://example.com",
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", { source: {} }),
			});

			await runSync({ loaded, context: { repoRoot: tmpDir }, loader, steps: ["homepage"], print: () => {} });

			const pkg = JSON.parse(await readFile(join(tmpDir, "package.json"), "utf8")) as { homepage: string };
			expect(pkg.homepage).toBe("https://example.com");
		});

		it("calls source.syncHomepage when provider implements it", async () => {
			let capturedUrl: string | null = null;
			const loaded = loadedFrom({
				name: "demo",
				homepage: "https://example.com",
				providers: { source: "github" },
			});
			const loader = makeLoaderWith(loaded, {
				"@theholocron/holocron-plugin-github": makePlugin("gh", {
					source: {
						syncHomepage: async (url: string) => {
							capturedUrl = url;
							return "homepage updated";
						},
					},
				}),
			});

			const report = await runSync({
				loaded,
				context: { repoRoot: tmpDir },
				loader,
				steps: ["homepage"],
				print: () => {},
			});

			expect(capturedUrl).toBe("https://example.com");
			const step = report.steps.find((s) => s.step === "sync homepage");
			expect(step?.status).toBe("ok");
			expect(step?.message).toContain("GitHub");
		});
	});

	it("passes manual and derived properties to syncProperties", async () => {
		let captured: Record<string, string> | null = null;
		const loaded = loadedFrom({
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
			name: "demo",
			repo: { name: "theholocron/demo", protection: "strict" },
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
			name: "demo",
			repo: { name: "theholocron/demo", protection: "none" },
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
			name: "demo",
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
			name: "demo",
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
