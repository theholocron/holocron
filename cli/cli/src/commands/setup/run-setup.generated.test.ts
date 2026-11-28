import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import type { RepoFileEntry } from "../repo-files/index.js";
import { thinCallerFile } from "../thin-caller-file/index.js";
import { runSetup } from "./run-setup.js";

const generated = vi.hoisted(() => ({ entries: [] as RepoFileEntry[] }));
vi.mock("../repo-files/index.js", () => ({ generateRepoFiles: async () => generated.entries }));

describe("setup: the generated files", () => {
	it("writes what the generator returns, and reports a file it could not generate as a failed step", async () => {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
			filepath: "/tmp/test/holocron.config.json",
		};
		const writes: string[] = [];
		const source = {
			readWorkflowFile: async () => null,
			writeWorkflowFile: async (name: string) => void writes.push(`workflow:${name}`),
			writeRepoFile: async (path: string) => void writes.push(`file:${path}`),
		};
		const importer = async () => ({
			createPlugin: () => ({ name: "github", capabilities: { source: () => source } }),
		});
		generated.entries = [
			{ kind: "skip", step: "write a", syncStep: "sync a", message: "not now" },
			{ kind: "error", step: "write codecov.yml", syncStep: "sync codecov.yml", message: "cannot merge" },
			{ kind: "file", path: "x.json", content: "{}", step: "write x.json", syncStep: "sync x.json" },
			{
				kind: "file",
				path: ".github/workflows/t.yml",
				content: "w",
				step: "write workflow t",
				syncStep: "sync workflow t",
				workflow: { task: "t", filename: "t.yml" },
			},
		];

		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test" },
			loader: new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter),
			print: () => {},
		});

		const status = (step: string) => report.steps.find((s) => s.step === step);
		expect(status("write a")).toMatchObject({ status: "skip", message: "not now" });
		expect(status("write codecov.yml")).toMatchObject({ status: "fail", message: "cannot merge" });
		expect(status("write x.json")?.status).toBe("ok");
		expect(status("write workflow t")?.status).toBe("ok");
		expect(writes).toEqual(["file:x.json", "workflow:t.yml"]);
	});
});

describe("setup: obsolete generated callers (#2466)", () => {
	const caller = {
		kind: "file",
		path: ".github/workflows/ci.keep.yml",
		content: "w",
		step: "write workflow keep",
		syncStep: "sync workflow keep",
		workflow: { task: "keep", filename: "ci.keep.yml" },
	} satisfies RepoFileEntry;

	async function run(opts: {
		files: Record<string, string>;
		entries?: RepoFileEntry[];
		tasks?: string[];
		dryRun?: boolean;
		listError?: Error;
		vanished?: string[];
	}) {
		const loaded: LoadedConfig = {
			resolved: resolveConfig({
				name: "demo",
				providers: { source: "github" },
				...(opts.tasks ? { tasks: opts.tasks } : {}),
			}),
			filepath: "/tmp/test/holocron.config.json",
		};
		const removed: string[] = [];
		const source = {
			listWorkflowFiles: async () => {
				if (opts.listError) throw opts.listError;
				return [...Object.keys(opts.files), ...(opts.vanished ?? [])];
			},
			readWorkflowFile: async (name: string) => opts.files[name] ?? null,
			writeWorkflowFile: async () => {},
			writeRepoFile: async () => {},
			removeWorkflowFile: async (name: string) => void removed.push(name),
		};
		const importer = async () => ({
			createPlugin: () => ({ name: "github", capabilities: { source: () => source } }),
		});
		generated.entries = opts.entries ?? [caller];
		const report = await runSetup({
			loaded,
			context: { repoRoot: "/tmp/test", ...(opts.dryRun ? { dryRun: true } : {}) },
			loader: new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test" }, importer as unknown as PluginImporter),
			print: () => {},
		});
		return { report, removed };
	}

	const files = {
		"ci.keep.yml": thinCallerFile(".", "name: keep\n"),
		"ci.old.yml": thinCallerFile(".", "name: old\n"),
		"ci.hand.yml": `# HAND-MAINTAINED\n${thinCallerFile(".", "name: hand\n")}`,
		"mine.yml": "name: mine\non: push\n",
		"ci.sentinel.yml": thinCallerFile("apps/sentinel", "name: sentinel\n"),
	};

	it("removes a generated caller whose task is gone and leaves every other file alone", async () => {
		const { report, removed } = await run({ files, tasks: ["keep"] });
		expect(removed).toEqual(["ci.old.yml"]);
		expect(report.steps.find((s) => s.step === "remove obsolete workflow ci.old.yml")?.status).toBe("ok");
	});

	it("lists the removal and removes nothing on --dry-run", async () => {
		const { report, removed } = await run({ files, tasks: ["keep"], dryRun: true });
		expect(removed).toEqual([]);
		expect(report.steps.find((s) => s.step === "remove obsolete workflow ci.old.yml")?.status).toBe("dry-run");
	});

	it("removes nothing when no tasks are configured", async () => {
		const { report, removed } = await run({ files });
		expect(removed).toEqual([]);
		expect(report.steps.some((s) => s.step.includes("obsolete"))).toBe(false);
	});

	it("removes nothing, and says so, when a task has no template", async () => {
		const noTemplate: RepoFileEntry = {
			kind: "skip",
			step: "write workflow x",
			syncStep: "sync workflow x",
			message: "no template",
		};
		const { report, removed } = await run({ files, tasks: ["keep"], entries: [caller, noTemplate] });
		expect(removed).toEqual([]);
		expect(report.steps.find((s) => s.step === "remove obsolete workflows")?.status).toBe("skip");
	});

	it("is not held back by a skip that is not about a workflow", async () => {
		const other: RepoFileEntry = {
			kind: "skip",
			step: "write codecov.yml",
			syncStep: "sync codecov.yml",
			message: "none",
		};
		const { removed } = await run({ files, tasks: ["keep"], entries: [caller, other] });
		expect(removed).toEqual(["ci.old.yml"]);
	});

	it("skips a file that is listed but gone by the time it is read", async () => {
		const { report, removed } = await run({ files, tasks: ["keep"], vanished: ["ci.gone.yml"] });
		expect(removed).toEqual(["ci.old.yml"]);
		expect(report.steps.some((s) => s.step.includes("ci.gone.yml"))).toBe(false);
	});

	it("reports a failed read as a failed step and removes nothing", async () => {
		const { report, removed } = await run({ files, tasks: ["keep"], listError: new Error("boom") });
		expect(removed).toEqual([]);
		expect(report.steps.find((s) => s.step === "remove obsolete workflows")).toMatchObject({
			status: "fail",
			message: "boom",
		});
	});
});
