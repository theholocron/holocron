import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";
import { runSetup } from "./run-setup.js";

const page = { name: "The Holocron", slug: "theholocron", components: [{ name: "Sentinel", tags: ["sentinel"] }] };
const made = {
	id: "p-1",
	created: true,
	components: { created: ["Sentinel"], updated: [] },
	rules: { created: ["Sentinel"], updated: [] },
};

function setup(monitoring: Record<string, unknown>) {
	const loaded: LoadedConfig = {
		resolved: resolveConfig({ name: "sentinel", providers: { monitoring: "checkly" } }),
		filepath: "/tmp/test/holocron.config.json",
	};
	const modules: Record<string, unknown> = {
		"@theholocron/holocron-plugin-checkly": {
			createPlugin: () => ({
				name: "checkly",
				capabilities: { monitoring: () => ({ checks: [], ...monitoring }) },
			}),
		},
	};
	const loader = new PluginLoader(loaded.resolved, { repoRoot: "/tmp/test", repo: "theholocron/holocron" }, (async (
		pkg: string
	) => {
		if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		return modules[pkg];
	}) as unknown as PluginImporter);
	return runSetup({ loaded, context: { repoRoot: "/tmp/test", dryRun: false }, loader, print: () => undefined });
}

describe("runSetup monitoring status pages", () => {
	it("ensures each declared status page after the checks and reports it", async () => {
		const ensureStatusPage = vi.fn(async () => made);
		const report = await setup({ statusPages: [page], ensureStatusPage });
		const rows = report.steps.filter((s) => s.capability === "monitoring");
		expect(ensureStatusPage).toHaveBeenCalledTimes(1);
		expect(rows.map((r) => [r.step, r.status])).toEqual([["ensureStatusPage The Holocron", "ok"]]);
	});

	it("skips a provider that cannot ensure a status page", async () => {
		const report = await setup({ statusPages: [page] });
		const rows = report.steps.filter((s) => s.capability === "monitoring");
		expect(rows).toEqual([expect.objectContaining({ status: "skip" })]);
	});
});
