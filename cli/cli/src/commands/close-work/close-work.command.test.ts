import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runCloseWork = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-close-work/run-close-work.js", () => ({ runCloseWork }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { closeCommand } from "../close/close.command.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(closeCommand, ["close", "work", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runCloseWork.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("close work", () => {
	it("passes the issue and the context, and nothing that was not given", async () => {
		await go("#12", "--dry-run");
		const input = runCloseWork.mock.calls[0]![0];
		expect(input).toMatchObject({
			issue: "#12",
			context: expect.objectContaining({ repoRoot: "/repo", dryRun: true, cliToken: "t", org: "acme" }),
		});
		for (const key of ["wait", "timeoutMinutes", "abandon", "keepWorktree", "pullRequest", "yes"]) {
			expect(input).not.toHaveProperty(key);
		}
	});

	it("passes every flag", async () => {
		await go("12", "--wait", "--timeout", "10", "--abandon", "--keep-worktree", "--pr", "7", "--yes");
		expect(runCloseWork.mock.calls[0]![0]).toMatchObject({
			issue: "12",
			wait: true,
			timeoutMinutes: 10,
			abandon: true,
			keepWorktree: true,
			pullRequest: 7,
			yes: true,
		});
	});

	it("exits non-zero when the run fails", async () => {
		runCloseWork.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go("#12");
		expect(process.exitCode).toBe(1);
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go("#12");
		expect(runCloseWork).not.toHaveBeenCalled();
	});
});
