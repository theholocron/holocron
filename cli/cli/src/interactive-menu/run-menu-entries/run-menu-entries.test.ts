import { beforeEach, describe, expect, it, vi } from "vitest";

const loadTasksConfigMock = vi.fn();
vi.mock("@theholocron/astromech/config", () => ({
	loadTasksConfig: (...args: unknown[]) => loadTasksConfigMock(...args),
}));

const runnableTasksMock = vi.fn();
const createAstromechMock = vi.fn();
vi.mock("@theholocron/astromech", () => ({
	createAstromech: (...args: unknown[]) => createAstromechMock(...args),
}));

const { buildRunMenuEntries, listRunnableTasks } = await import("../run-menu-entries/index.js");

describe("listRunnableTasks", () => {
	beforeEach(() => {
		loadTasksConfigMock.mockReset();
		createAstromechMock.mockReset();
		runnableTasksMock.mockReset();
		createAstromechMock.mockReturnValue({ runnableTasks: runnableTasksMock });
	});

	it("delegates to Astromech.runnableTasks(), passing the resolved config through", async () => {
		loadTasksConfigMock.mockResolvedValue({ tasks: ["verification.unitTests", "sourceQuality.staticAnalysis"] });
		runnableTasksMock.mockReturnValue(["verification.unitTests", "sourceQuality.staticAnalysis"]);
		const tasks = await listRunnableTasks({ cwd: "/repo" });
		expect(tasks).toEqual(["verification.unitTests", "sourceQuality.staticAnalysis"]);
		expect(createAstromechMock).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/repo",
				config: { tasks: ["verification.unitTests", "sourceQuality.staticAnalysis"] },
			})
		);
	});

	it("falls back to process.cwd() when argv.cwd isn't a string", async () => {
		loadTasksConfigMock.mockResolvedValue({});
		runnableTasksMock.mockReturnValue([]);
		await listRunnableTasks({});
		expect(loadTasksConfigMock).toHaveBeenCalledWith(process.cwd());
	});

	it("resolves to an empty list (never throws) when loadTasksConfig rejects", async () => {
		loadTasksConfigMock.mockRejectedValue(new Error("no config file"));
		runnableTasksMock.mockReturnValue([]);
		const tasks = await listRunnableTasks({ cwd: "/repo" });
		expect(tasks).toEqual([]);
		expect(createAstromechMock).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/repo", config: undefined }));
	});
});

describe("buildRunMenuEntries", () => {
	it("returns [] for an empty task list", () => {
		expect(buildRunMenuEntries([])).toEqual([]);
	});

	it("groups a namespace's tasks under a leading `(run it)` group entry plus one leaf per task", () => {
		const entries = buildRunMenuEntries(["sourceQuality.staticAnalysis", "sourceQuality.formatting"]);
		expect(entries.map((e) => e.name)).toEqual([
			"run sourceQuality",
			"run sourceQuality staticAnalysis",
			"run sourceQuality formatting",
		]);
		expect(entries[0]).toMatchObject({ spawnArgs: ["run", "sourceQuality"], supportsDryRun: true });
		expect(entries[1]).toMatchObject({ spawnArgs: ["run", "sourceQuality.staticAnalysis"] });
		expect(entries[2]).toMatchObject({ spawnArgs: ["run", "sourceQuality.formatting"] });
	});

	it("still emits a group header for a namespace with exactly one task", () => {
		const entries = buildRunMenuEntries(["delivery.build"]);
		expect(entries.map((e) => e.name)).toEqual(["run delivery", "run delivery build"]);
		expect(entries[1]).toMatchObject({ spawnArgs: ["run", "delivery.build"] });
	});

	it("gives a dotless (namespace-less) task no group header, just a bare leaf", () => {
		const entries = buildRunMenuEntries(["ci"]);
		expect(entries.map((e) => e.name)).toEqual(["run ci"]);
		expect(entries[0]).toMatchObject({ spawnArgs: ["run", "ci"] });
	});

	it("orders namespace groups per RUN_MENU_NAMESPACE_ORDER, not input order", () => {
		const entries = buildRunMenuEntries([
			"verification.unitTests",
			"delivery.build",
			"sourceQuality.staticAnalysis",
		]);
		const groupNames = entries.filter((e) => e.name.split(" ").length === 2).map((e) => e.name);
		expect(groupNames).toEqual(["run delivery", "run sourceQuality", "run verification"]);
	});

	it("sorts an unrecognized namespace after every known one, preserving its first-seen order among unknowns", () => {
		const entries = buildRunMenuEntries(["zzz.custom", "aaa.custom", "delivery.build"]);
		const groupNames = entries.filter((e) => e.name.split(" ").length === 2).map((e) => e.name);
		expect(groupNames).toEqual(["run delivery", "run zzz", "run aaa"]);
	});

	it("sorts an unrecognized namespace after a known one even when the unknown one sorted first going in", () => {
		const entries = buildRunMenuEntries(["delivery.build", "zzz.custom"]);
		const groupNames = entries.filter((e) => e.name.split(" ").length === 2).map((e) => e.name);
		expect(groupNames).toEqual(["run delivery", "run zzz"]);
	});
});
