import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader } from "../../plugin/index.js";

const handOff = vi.hoisted(() => vi.fn(async (_input: { key: string; repoRoot: string }) => undefined));
vi.mock("./dashboard-key/index.js", () => ({ handOffDashboardKey: handOff }));

import { runSetup } from "./run-setup.js";

const KEY = "secret-view-key";
const dashboard = { name: "The Holocron", tags: ["sentinel"] };

function setup(monitoring: Record<string, unknown>, dryRun = false) {
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
	const printed: string[] = [];
	return {
		printed,
		run: () =>
			runSetup({
				loaded,
				context: { repoRoot: "/tmp/test", dryRun },
				loader,
				print: (line) => void printed.push(line),
			}),
	};
}

const rows = (report: Awaited<ReturnType<ReturnType<typeof setup>["run"]>>) =>
	report.steps.filter((s) => s.capability === "monitoring");

describe("runSetup monitoring dashboards", () => {
	it("ensures each declared dashboard and reports created, then what it updated", async () => {
		const ensureDashboard = vi
			.fn()
			.mockResolvedValueOnce({ id: "d-1", created: true })
			.mockResolvedValueOnce({ id: "d-1", created: false, updated: ["tags"] });
		const { run } = setup({ dashboards: [dashboard, { ...dashboard, name: "Two" }], ensureDashboard });
		const out = rows(await run());
		expect(out.map((r) => r.step)).toEqual(["ensureDashboard The Holocron", "ensureDashboard Two"]);
		expect(out[0]?.message).toBe("The Holocron created");
		expect(out[1]?.message).toBe("Two exists (updated tags)");
		expect(handOff).not.toHaveBeenCalled();
	});

	it("hands a returned key over and never prints it", async () => {
		handOff.mockClear();
		const ensureDashboard = async () => ({ id: "d-1", created: true, key: KEY });
		const { run, printed } = setup({ dashboards: [dashboard], ensureDashboard });
		const out = rows(await run());
		expect(handOff).toHaveBeenCalledWith(expect.objectContaining({ key: KEY, repoRoot: "/tmp/test" }));
		expect(out.map((r) => r.step)).toEqual([
			"ensureDashboard The Holocron",
			"hand over dashboard key for The Holocron",
		]);
		expect(out[1]?.status).toBe("ok");
		expect(JSON.stringify(out) + printed.join("\n")).not.toContain(KEY);
	});

	it("fails the hand-over step, without the key, when the file cannot be written", async () => {
		handOff.mockRejectedValueOnce(new Error("refusing to write: git does not ignore it"));
		const ensureDashboard = async () => ({ id: "d-1", created: true, key: KEY });
		const { run } = setup({ dashboards: [dashboard], ensureDashboard });
		const out = rows(await run());
		expect(out[1]).toMatchObject({ status: "fail", message: "refusing to write: git does not ignore it" });
	});

	it("writes nothing on --dry-run", async () => {
		handOff.mockClear();
		const ensureDashboard = vi.fn();
		const { run } = setup({ dashboards: [dashboard], ensureDashboard }, true);
		const out = rows(await run());
		expect(out.map((r) => r.status)).toEqual(["dry-run"]);
		expect(ensureDashboard).not.toHaveBeenCalled();
		expect(handOff).not.toHaveBeenCalled();
	});

	it("skips a dashboard when the provider has no ensureDashboard", async () => {
		const { run } = setup({ dashboards: [dashboard] });
		expect((await run()).steps.filter((s) => s.capability === "monitoring")[0]).toMatchObject({
			status: "skip",
			message: "provider has no dashboards",
		});
	});

	it("does nothing for a provider that declares no dashboards", async () => {
		const { run } = setup({});
		expect(rows(await run())).toEqual([]);
	});
});
