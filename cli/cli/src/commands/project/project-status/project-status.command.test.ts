import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runProjectStatus = vi.hoisted(() => vi.fn());
vi.mock("../../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./project-status.js", () => ({ runProjectStatus }));
vi.mock("../../token-context/index.js", () => ({ tokenContext }));
vi.mock("../../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../../run-command.testing.js";
import { projectCommand } from "../project.command.js";

const go = (...args: string[]) => runCommand(projectCommand, ["project", "status", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runProjectStatus.mockResolvedValue({ status: "ok", summary: { ok: 1, fail: 0, skip: 0 } });
});
afterEach(() => void (process.exitCode = undefined));

describe("project status command", () => {
	it("passes the issue, the status and the context", async () => {
		await go("#12", "In Progress", "--dry-run");
		expect(runProjectStatus).toHaveBeenCalledWith(
			expect.objectContaining({
				issue: "#12",
				status: "In Progress",
				context: expect.objectContaining({ repoRoot: "/repo", dryRun: true, cliToken: "t", org: "acme" }),
			})
		);
		expect(runProjectStatus.mock.calls[0]?.[0]).not.toHaveProperty("board");
	});

	it("passes --board and --org", async () => {
		await go("12", "Done", "--board", "v5", "--org", "other");
		expect(runProjectStatus).toHaveBeenCalledWith(expect.objectContaining({ board: "v5", owner: "other" }));
	});

	it("takes a number as text", async () => {
		await go("12", "Done");
		expect(runProjectStatus).toHaveBeenCalledWith(expect.objectContaining({ issue: "12" }));
	});

	it("needs an issue and a status", async () => {
		await expect(go("12")).rejects.toThrow();
		expect(runProjectStatus).not.toHaveBeenCalled();
	});

	it("exits non-zero when the run fails", async () => {
		runProjectStatus.mockResolvedValue({ status: "fail", summary: { ok: 0, fail: 1, skip: 0 } });
		await go("12", "Done");
		expect(process.exitCode).toBe(1);
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValue(undefined);
		await go("12", "Done");
		expect(loadConfig).not.toHaveBeenCalled();
		expect(runProjectStatus).not.toHaveBeenCalled();
	});
});
