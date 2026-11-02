import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSpecsSync = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../specs-sync/specs-sync.js", () => ({ runSpecsSync }));
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
import { specsCommand } from "./specs.command.js";

const go = (args: string[]) => runCommand(specsCommand, ["specs", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSpecsSync.mockResolvedValue({ status: "ok", files: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("specs sync", () => {
	it("runs with the context from the tokens and the org, reading and writing the working tree", async () => {
		await go(["sync"]);

		const input = runSpecsSync.mock.calls[0]![0];
		expect(input).toMatchObject({
			context: { repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" },
			notify: false,
		});
		expect(input.io).toEqual({
			list: expect.any(Function),
			read: expect.any(Function),
			write: expect.any(Function),
		});
		expect("provider" in input).toBe(false);
		expect("channel" in input).toBe(false);
		expect(process.exitCode).toBeUndefined();
	});

	it("passes --provider, --channel and --notify when given", async () => {
		await go(["sync", "--provider", "discord", "--channel", "ideas", "--notify"]);

		expect(runSpecsSync.mock.calls[0]![0]).toMatchObject({ provider: "discord", channel: "ideas", notify: true });
	});

	it("exits 1 when the sync failed", async () => {
		runSpecsSync.mockResolvedValue({ status: "fail", files: [] });
		await go(["sync"]);
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await go(["sync"]);
		expect(runSpecsSync).not.toHaveBeenCalled();
	});
});

describe("specs menu", () => {
	it("a bare `specs` opens the menu at that group", async () => {
		await go([]);

		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			"specs — choose a subcommand:",
			expect.any(String),
			["specs"]
		);
	});
});
