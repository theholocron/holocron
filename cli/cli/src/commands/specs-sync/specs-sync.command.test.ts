import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSpecsSync = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("../specs-sync/specs-sync.js", () => ({ runSpecsSync }));
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
import { syncCommand } from "../sync/sync.command.js";

const go = (args: string[]) => runCommand(syncCommand, ["sync", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSpecsSync.mockResolvedValue({ status: "ok", files: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("sync specs", () => {
	it("runs with the context from the tokens and the org, reading and writing the working tree", async () => {
		await go(["specs"]);

		const input = runSpecsSync.mock.calls[0]![0];
		expect(input).toMatchObject({
			context: { repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" },
			notify: false,
		});
		expect(input.io).toEqual({
			list: expect.any(Function),
			read: expect.any(Function),
			write: expect.any(Function),
			origin: expect.any(Function),
		});
		expect("provider" in input).toBe(false);
		expect("channel" in input).toBe(false);
		expect("files" in input).toBe(false);
		expect("pr" in input).toBe(false);
		expect(process.exitCode).toBeUndefined();
	});

	it("passes --provider, --channel and --notify when given", async () => {
		await go(["specs", "--provider", "discord", "--channel", "ideas", "--notify"]);

		expect(runSpecsSync.mock.calls[0]![0]).toMatchObject({ provider: "discord", channel: "ideas", notify: true });
	});

	it("passes --refresh-origin only when given", async () => {
		await go(["specs", "--refresh-origin"]);
		await go(["specs"]);

		expect(runSpecsSync.mock.calls[0]![0]).toMatchObject({ refreshOrigin: true });
		expect(runSpecsSync.mock.calls[1]![0]).toMatchObject({ refreshOrigin: false });
	});

	it("passes --refresh-titles only when given", async () => {
		await go(["specs", "--refresh-titles"]);
		await go(["specs"]);

		expect(runSpecsSync.mock.calls[0]![0]).toMatchObject({ refreshTitles: true });
		expect(runSpecsSync.mock.calls[1]![0]).toMatchObject({ refreshTitles: false });
	});

	it("passes --files and --pr for a pull request that is still open", async () => {
		await go(["specs", "--files", ".notes/a.spec.md", ".notes/b.spec.md", "--pr", "1700"]);

		expect(runSpecsSync.mock.calls[0]![0]).toMatchObject({
			files: [".notes/a.spec.md", ".notes/b.spec.md"],
			pr: 1700,
		});
	});

	it("exits 1 when the sync failed", async () => {
		runSpecsSync.mockResolvedValue({ status: "fail", files: [] });
		await go(["specs"]);
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await go(["specs"]);
		expect(runSpecsSync).not.toHaveBeenCalled();
	});
});
