import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runCleanupBranches = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./index.js", () => ({ runCleanupBranches }));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../../testing/run-command.js";
import { repoCleanupBranchesCommand } from "./repo-cleanup-branches.command.js";

const go = (args: string[]) => runCommand(repoCleanupBranchesCommand, ["branches", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runCleanupBranches.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("repo cleanup branches", () => {
	it("refuses to run without --local", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		await go([]);
		expect(runCleanupBranches).not.toHaveBeenCalled();
		expect(err).toHaveBeenCalledWith(expect.stringContaining("--local"));
		expect(process.exitCode).toBe(1);
		err.mockRestore();
	});

	it("does nothing when there is no token", async () => {
		tokenContext.mockReturnValue(undefined);
		await go(["--local"]);
		expect(runCleanupBranches).not.toHaveBeenCalled();
	});

	it("runs a dry listing by default", async () => {
		await go(["--local"]);
		const input = runCleanupBranches.mock.calls[0]?.[0];
		expect(input).not.toHaveProperty("yes");
		expect(input).not.toHaveProperty("repo");
		expect(input.context).toMatchObject({ org: "acme", cliToken: "t", dryRun: false });
	});

	it("passes --yes and --repo through", async () => {
		await go(["--local", "--yes", "--repo", "o/r"]);
		expect(runCleanupBranches.mock.calls[0]?.[0]).toMatchObject({ yes: true, repo: "o/r" });
	});

	it("exits 1 when a branch could not be deleted", async () => {
		runCleanupBranches.mockResolvedValue({ status: "fail" });
		await go(["--local", "--yes"]);
		expect(process.exitCode).toBe(1);
	});
});
