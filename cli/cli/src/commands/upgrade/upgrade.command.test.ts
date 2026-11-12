import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const runUpgradeNode = vi.hoisted(() => vi.fn());
const runUpgradeDeps = vi.hoisted(() => vi.fn());
const readFileSync = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("node:fs", async (importActual) => ({ ...(await importActual<typeof import("node:fs")>()), readFileSync }));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../upgrade-node/index.js", () => ({ runUpgradeNode }));
vi.mock("../upgrade-deps/index.js", () => ({ runUpgradeDeps }));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));
vi.mock("@theholocron/kyber/prompts", async (importActual) => ({
	...(await importActual<typeof import("@theholocron/kyber/prompts")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["to"]],
}));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { runCommand } from "../run-command.testing.js";
import { upgradeCommand } from "./upgrade.command.js";

const go = (args: string[]) => runCommand(upgradeCommand, ["upgrade", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runUpgradeNode.mockResolvedValue({ status: "ok" });
	runUpgradeDeps.mockResolvedValue({ status: "ok" });
	readFileSync.mockImplementation(() => {
		throw new Error("ENOENT");
	});
});
afterEach(() => void (process.exitCode = undefined));

describe("upgrade", () => {
	it("`upgrade node` moves the pins to the new major, from --from, with the extra files from the config", async () => {
		readFileSync.mockReturnValue(JSON.stringify({ upgrade: { node: { extra: ["a.yml", "b.yml"] } } }));
		await go(["node", "24", "--from", "22"]);
		expect(runUpgradeNode).toHaveBeenCalledWith({
			to: 24,
			from: 22,
			cwd: "/repo",
			dryRun: false,
			extra: ["a.yml", "b.yml"],
		});
	});

	it("`upgrade node` copes with no config, a config without the section, or an `extra` that is not a list", async () => {
		await go(["node", "24"]);
		expect(runUpgradeNode).toHaveBeenLastCalledWith({ to: 24, cwd: "/repo", dryRun: false, extra: [] });
		readFileSync.mockReturnValue("{}");
		await go(["node", "24"]);
		expect(runUpgradeNode.mock.calls[1]![0].extra).toEqual([]);
		readFileSync.mockReturnValue(JSON.stringify({ upgrade: { node: { extra: "nope" } } }));
		await go(["node", "24"]);
		expect(runUpgradeNode.mock.calls[2]![0].extra).toEqual([]);
	});

	it("`upgrade node` reports why it failed", async () => {
		runUpgradeNode.mockResolvedValue({ status: "fail", message: "no pins" });
		await go(["node", "24"]);
		expect(reportError).toHaveBeenCalledWith("upgrade node: no pins");
		expect(process.exitCode).toBe(1);
		reportError.mockClear();
		runUpgradeNode.mockResolvedValue({ status: "fail" });
		await go(["node", "24"]);
		expect(reportError).not.toHaveBeenCalled();
	});

	it("`upgrade deps` bumps the pins, with --pins-only, and reports why it failed", async () => {
		await go(["deps", "--pins-only"]);
		expect(runUpgradeDeps).toHaveBeenCalledWith({ cwd: "/repo", dryRun: false, pinsOnly: true });
		runUpgradeDeps.mockResolvedValue({ status: "fail", message: "registry down" });
		await go(["deps"]);
		expect(reportError).toHaveBeenCalledWith("upgrade deps: registry down");
		expect(process.exitCode).toBe(1);
		reportError.mockClear();
		runUpgradeDeps.mockResolvedValue({ status: "fail" });
		await go(["deps"]);
		expect(reportError).not.toHaveBeenCalled();
	});
});

describe("upgrade menu", () => {
	it("a bare `upgrade` opens the menu at that group", async () => {
		await go([]);
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ pickMessage: "upgrade — choose a subcommand:", startPath: ["upgrade"] })
		);
	});
});
