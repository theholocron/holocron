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
	it("does nothing when there is no token", async () => {
		tokenContext.mockReturnValue(undefined);
		await go([]);
		expect(runCleanupBranches).not.toHaveBeenCalled();
	});

	it("covers both sides by default, and asks rather than deleting", async () => {
		await go([]);
		const input = runCleanupBranches.mock.calls[0]?.[0];
		expect(input.scope).toBe("both");
		expect(input).not.toHaveProperty("yes");
		expect(input).not.toHaveProperty("repo");
		expect(input.context).toMatchObject({ org: "acme", cliToken: "t", dryRun: false });
	});

	it("narrows the scope with --local or --remote, and both flags mean both", async () => {
		await go(["--local"]);
		await go(["--remote"]);
		await go(["--local", "--remote"]);
		expect(runCleanupBranches.mock.calls.map((c) => c[0].scope)).toEqual(["local", "remote", "both"]);
	});

	it("passes --yes, --repo and the global --dry-run through", async () => {
		await go(["--yes", "--repo", "o/r", "--dry-run"]);
		expect(runCleanupBranches.mock.calls[0]?.[0]).toMatchObject({ yes: true, repo: "o/r" });
		expect(runCleanupBranches.mock.calls[0]?.[0].context.dryRun).toBe(true);
	});

	it("exits 1 when a branch could not be deleted", async () => {
		runCleanupBranches.mockResolvedValue({ status: "fail" });
		await go(["--yes"]);
		expect(process.exitCode).toBe(1);
	});
});
