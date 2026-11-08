import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../../../config/index.js";
import { generateWorkflowFiles } from "../../repo-files/index.js";
import { generatePackageWorkflows } from "./generate-package-workflows.js";

vi.mock("../../../config/index.js", () => ({ loadConfig: vi.fn() }));
vi.mock("../../repo-files/index.js", () => ({ generateWorkflowFiles: vi.fn() }));

describe("generatePackageWorkflows", () => {
	let root: string;

	function pkg(dir: string, config?: string) {
		mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: `@x/${dir.replaceAll("/", "-")}` }));
		if (config !== undefined) writeFileSync(join(root, dir, config), "");
	}

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "package-workflows-"));
		writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - tools\n");
		pkg("apps/a", "holocron.config.ts");
		pkg("apps/b", "holocron.config.json");
		pkg("apps/c");
		pkg("tools", "holocron.config.mjs");
	});
	afterEach(() => {
		vi.mocked(loadConfig).mockReset();
		vi.mocked(generateWorkflowFiles).mockReset();
		rmSync(root, { recursive: true, force: true });
	});

	const workflow = (path: string) => ({
		kind: "file" as const,
		path,
		content: path,
		step: "write",
		syncStep: "sync",
		workflow: { task: "x", filename: "ci.x.yml" },
	});

	it("generates twice, for each package that has a config of its own, keeping files and dropping skips", async () => {
		vi.mocked(loadConfig).mockImplementation(async (dir) => ({ filepath: join(dir, "x"), resolved: {} }) as never);
		vi.mocked(generateWorkflowFiles).mockReturnValue([
			workflow(".github/workflows/ci.x.yml"),
			{ kind: "skip", step: "s", syncStep: "s", message: "no template" },
		]);
		const result = await generatePackageWorkflows(root);
		expect(result.errors).toEqual([]);
		expect(result.packages.map((p) => p.path)).toEqual(["apps/a", "apps/b", "tools"]);
		expect(result.packages[0]).toEqual({
			path: "apps/a",
			files: [workflow(".github/workflows/ci.x.yml")],
			again: [workflow(".github/workflows/ci.x.yml")],
		});
		expect(vi.mocked(loadConfig)).toHaveBeenCalledWith(join(root, "apps/a"));
		expect(vi.mocked(generateWorkflowFiles)).toHaveBeenCalledTimes(6);
	});

	it("reports a package whose config cannot be loaded and goes on with the rest", async () => {
		vi.mocked(loadConfig).mockImplementation(async (dir) => {
			if (dir.endsWith("apps/a")) throw new Error("bad config");
			return { filepath: join(dir, "x"), resolved: {} } as never;
		});
		vi.mocked(generateWorkflowFiles).mockReturnValue([]);
		const result = await generatePackageWorkflows(root);
		expect(result.errors).toEqual(["apps/a: could not generate its workflows: bad config"]);
		expect(result.packages.map((p) => p.path)).toEqual(["apps/b", "tools"]);
	});
});
