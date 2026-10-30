import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import type { RepoFileEntry } from "../repo-files/index.js";
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
