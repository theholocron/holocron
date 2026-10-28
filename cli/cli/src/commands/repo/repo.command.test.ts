import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const runSetup = vi.hoisted(() => vi.fn());
const runSync = vi.hoisted(() => vi.fn());
const runSyncReadme = vi.hoisted(() => vi.fn());
const runUpgradeNode = vi.hoisted(() => vi.fn());
const runUpgradeDeps = vi.hoisted(() => vi.fn());
const readFileSync = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("node:fs", async (importActual) => ({ ...(await importActual<typeof import("node:fs")>()), readFileSync }));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../setup/index.js", () => ({ runSetup }));
vi.mock("../sync/index.js", () => ({ runSync }));
vi.mock("../sync-readme/index.js", () => ({ runSyncReadme }));
vi.mock("../upgrade-node/index.js", () => ({ runUpgradeNode }));
vi.mock("../upgrade-deps/index.js", () => ({ runUpgradeDeps }));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["to"]],
}));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { runCommand } from "../../testing/run-command.js";
import { repoCommand } from "./repo.command.js";

const go = (args: string[]) => runCommand(repoCommand, ["repo", ...args]);
const summary = (fail: number) => ({ summary: { ok: 1, fail, skip: 0 } });

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSetup.mockResolvedValue(summary(0));
	runSync.mockResolvedValue(summary(0));
	runSyncReadme.mockResolvedValue({ status: "ok" });
	runUpgradeNode.mockResolvedValue({ status: "ok" });
	runUpgradeDeps.mockResolvedValue({ status: "ok" });
	readFileSync.mockImplementation(() => {
		throw new Error("ENOENT");
	});
});
afterEach(() => void (process.exitCode = undefined));

describe("repo setup", () => {
	it("applies setup with the tokens, the org and --repo, and --hooks when given", async () => {
		await go(["setup", "--repo", "acme/widgets", "--no-hooks"]);
		expect(runSetup.mock.calls[0]![0]).toMatchObject({
			hooks: false,
			context: { repoRoot: "/repo", repo: "acme/widgets", cliToken: "t", org: "acme" },
		});
		await go(["setup"]);
		const bare = runSetup.mock.calls[1]![0];
		expect("hooks" in bare || "repo" in bare.context).toBe(false);
	});

	it("exits 1 when a step failed, and stops when --token cannot be parsed", async () => {
		runSetup.mockResolvedValue(summary(2));
		await go(["setup"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSetup.mockClear();
		await go(["setup"]);
		expect(runSetup).not.toHaveBeenCalled();
	});
});

describe("repo sync", () => {
	it("syncs the named steps, or all of them, for --repo", async () => {
		await go(["sync", "labels", "topics", "--repo", "acme/widgets"]);
		expect(runSync.mock.calls[0]![0]).toMatchObject({
			steps: ["labels", "topics"],
			context: { repo: "acme/widgets", cliToken: "t", org: "acme" },
		});
		await go(["sync"]);
		const bare = runSync.mock.calls[1]![0];
		expect("steps" in bare || "repo" in bare.context).toBe(false);
	});

	it("exits 1 when a step failed, and stops when --token cannot be parsed", async () => {
		runSync.mockResolvedValue(summary(1));
		await go(["sync"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSync.mockClear();
		await go(["sync"]);
		expect(runSync).not.toHaveBeenCalled();
	});

	it("`sync readme` updates the README, and reports why when it failed", async () => {
		await go(["sync", "readme", "--dry-run"]);
		expect(runSyncReadme).toHaveBeenCalledWith({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", dryRun: true },
		});
		runSyncReadme.mockResolvedValue({ status: "fail", message: "no package.json" });
		await go(["sync", "readme"]);
		expect(reportError).toHaveBeenCalledWith("repo sync readme: no package.json");
		expect(process.exitCode).toBe(1);
		reportError.mockClear();
		runSyncReadme.mockResolvedValue({ status: "fail" });
		await go(["sync", "readme"]);
		expect(reportError).not.toHaveBeenCalled();
	});
});

describe("repo upgrade", () => {
	it("`upgrade node` moves the pins to the new major, from --from, with the extra files from the config", async () => {
		readFileSync.mockReturnValue(JSON.stringify({ upgrade: { node: { extra: ["a.yml", "b.yml"] } } }));
		await go(["upgrade", "node", "24", "--from", "22"]);
		expect(runUpgradeNode).toHaveBeenCalledWith({
			to: 24,
			from: 22,
			cwd: "/repo",
			dryRun: false,
			extra: ["a.yml", "b.yml"],
		});
	});

	it("`upgrade node` copes with no config, a config without the section, or an `extra` that is not a list", async () => {
		await go(["upgrade", "node", "24"]);
		expect(runUpgradeNode).toHaveBeenLastCalledWith({ to: 24, cwd: "/repo", dryRun: false, extra: [] });
		readFileSync.mockReturnValue("{}");
		await go(["upgrade", "node", "24"]);
		expect(runUpgradeNode.mock.calls[1]![0].extra).toEqual([]);
		readFileSync.mockReturnValue(JSON.stringify({ upgrade: { node: { extra: "nope" } } }));
		await go(["upgrade", "node", "24"]);
		expect(runUpgradeNode.mock.calls[2]![0].extra).toEqual([]);
	});

	it("`upgrade node` reports why it failed", async () => {
		runUpgradeNode.mockResolvedValue({ status: "fail", message: "no pins" });
		await go(["upgrade", "node", "24"]);
		expect(reportError).toHaveBeenCalledWith("upgrade node: no pins");
		expect(process.exitCode).toBe(1);
		reportError.mockClear();
		runUpgradeNode.mockResolvedValue({ status: "fail" });
		await go(["upgrade", "node", "24"]);
		expect(reportError).not.toHaveBeenCalled();
	});

	it("`upgrade deps` bumps the pins, with --pins-only, and reports why it failed", async () => {
		await go(["upgrade", "deps", "--pins-only"]);
		expect(runUpgradeDeps).toHaveBeenCalledWith({ cwd: "/repo", dryRun: false, pinsOnly: true });
		runUpgradeDeps.mockResolvedValue({ status: "fail", message: "registry down" });
		await go(["upgrade", "deps"]);
		expect(reportError).toHaveBeenCalledWith("upgrade deps: registry down");
		expect(process.exitCode).toBe(1);
		reportError.mockClear();
		runUpgradeDeps.mockResolvedValue({ status: "fail" });
		await go(["upgrade", "deps"]);
		expect(reportError).not.toHaveBeenCalled();
	});
});

describe("repo menus", () => {
	it("a bare `repo` or `repo upgrade` opens the menu at that group", async () => {
		await go([]);
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			"repo — choose a subcommand:",
			expect.any(String),
			["repo"]
		);
		await go(["upgrade"]);
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			"repo upgrade — choose a subcommand:",
			expect.any(String),
			["repo", "upgrade"]
		);
	});
});
