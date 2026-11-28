import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runStartWork = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-start-work/run-start-work.js", () => ({ runStartWork }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { startCommand } from "../start/start.command.js";

const go = (...args: string[]) => runCommand(startCommand, ["start", "work", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runStartWork.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("start work", () => {
	it("passes the issue and the context, and nothing that was not given", async () => {
		await go("#12", "--dry-run");
		const input = runStartWork.mock.calls[0]![0];
		expect(input).toMatchObject({
			issue: "#12",
			context: expect.objectContaining({ repoRoot: "/repo", dryRun: true, cliToken: "t", org: "acme" }),
		});
		for (const key of [
			"name",
			"title",
			"base",
			"worktree",
			"worktreePath",
			"spec",
			"onePr",
			"kind",
			"effort",
			"assignees",
			"project",
			"noPr",
			"yes",
		])
			expect(input).not.toHaveProperty(key);
	});

	it("passes every flag in the run's words", async () => {
		await go(
			"12",
			"--name",
			"thing",
			"--title",
			"feat: x",
			"--base",
			"main",
			"--no-worktree",
			"--worktree-path",
			"w",
			"--spec",
			".notes/a.spec.md",
			"--one-pr",
			"--type",
			"bug",
			"--effort",
			"low",
			"--assignee",
			"a",
			"--assignee",
			"b",
			"--project",
			"v5",
			"--no-pr",
			"--yes"
		);
		expect(runStartWork).toHaveBeenCalledWith(
			expect.objectContaining({
				issue: "12",
				name: "thing",
				title: "feat: x",
				base: "main",
				worktree: false,
				worktreePath: "w",
				spec: ".notes/a.spec.md",
				onePr: true,
				kind: "bug",
				effort: "low",
				assignees: ["a", "b"],
				project: "v5",
				noPr: true,
				yes: true,
			})
		);
	});

	it("takes a Type the organization declares, as its lower-case kind, and refuses it when it is not declared", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("1", "--type", "Epic");
		expect(runStartWork).not.toHaveBeenCalled();
		expect(err).toHaveBeenCalledWith(expect.stringContaining("Use one of: bug, feature, task"));
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		loadConfig.mockResolvedValue({ resolved: { org: "acme", issueTypes: [{ name: "Epic" }] }, filepath: "/x" });
		await go("1", "--type", "Epic");
		expect(runStartWork).toHaveBeenCalledWith(expect.objectContaining({ kind: "epic" }));
		err.mockRestore();
	});

	it("refuses a type or effort it does not know", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("1", "--type", "epic").catch(() => undefined);
		await go("1", "--effort", "huge").catch(() => undefined);
		expect(runStartWork).not.toHaveBeenCalled();
		err.mockRestore();
	});

	it("does nothing without tokens, and exits non-zero on a failed run", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go("1");
		expect(runStartWork).not.toHaveBeenCalled();
		runStartWork.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go("1");
		expect(process.exitCode).toBe(1);
	});
});
