import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runSetup } from "./run-setup.js";

function setup(extra: Record<string, unknown>, issues: Record<string, unknown>, yes = true) {
	const loaded: LoadedConfig = {
		resolved: resolveConfig({ name: "x", providers: { issues: "github" }, ...extra }),
		filepath: "/tmp/test/holocron.config.json",
	};
	const modules: Record<string, unknown> = {
		"@theholocron/holocron-plugin-github": {
			createPlugin: () => ({ name: "github", capabilities: { issues: () => issues } }),
		},
	};
	const loader = new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test", repo: "theholocron/holocron" }, (async (
		pkg: string
	) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg];
	}) as unknown as PluginImporter);
	return runSetup({
		loaded,
		context: { repoRoot: "/tmp/test", dryRun: false },
		loader,
		print: () => undefined,
		yes,
	});
}

describe("runSetup issue types", () => {
	it("makes the declared Types as an issues section", async () => {
		const createType = vi.fn(async () => ({ id: 1, name: "Epic", enabled: true }));
		const report = await setup(
			{ issueTypes: [{ name: "Epic" }] },
			{ providerName: "github", listTypes: async () => [], createType }
		);
		expect(createType).toHaveBeenCalledTimes(1);
		expect(report.steps.filter((s) => s.capability === "issues")).toEqual([
			expect.objectContaining({ step: "issue type Epic", status: "ok" }),
		]);
	});

	it("adds no step and reads nothing when the repo declares no Types", async () => {
		const listTypes = vi.fn(async () => []);
		const report = await setup({}, { providerName: "github", listTypes, createType: vi.fn() });
		expect(listTypes).not.toHaveBeenCalled();
		expect(report.steps.filter((s) => s.capability === "issues")).toEqual([]);
	});
});
