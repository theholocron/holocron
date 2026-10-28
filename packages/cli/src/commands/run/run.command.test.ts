import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lintCommitMsgFile = vi.hoisted(() => vi.fn());
const loadTasksConfig = vi.hoisted(() => vi.fn());
const ci = vi.hoisted(() => vi.fn());
const run = vi.hoisted(() => vi.fn());
const createAstromech = vi.hoisted(() => vi.fn(() => ({ ci, run })));
const buildCliLogger = vi.hoisted(() => vi.fn(() => ({ logger: "logger" })));
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@theholocron/astromech", () => ({ createAstromech }));
vi.mock("@theholocron/astromech/config", () => ({ loadTasksConfig }));
vi.mock("@theholocron/astromech/lint", () => ({ lintCommitMsgFile }));
vi.mock("../../observability/logger/index.js", () => ({ buildCliLogger, reportError }));

import { runCommand } from "../../testing/run-command.js";
import { runCommand as runCmd } from "./run.command.js";

const go = (args: string[]) => runCommand(runCmd, args);

beforeEach(() => {
	vi.clearAllMocks();
	loadTasksConfig.mockResolvedValue({ tasks: "config" });
	ci.mockReturnValue({ status: "ok" });
	run.mockReturnValue({ status: "ok" });
	lintCommitMsgFile.mockResolvedValue({ valid: true, violations: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("run command", () => {
	it("runs a task with the job, the args after `--`, and the flags", async () => {
		await go(["run", "audit", "performance", "extra", "--required", "--filter", "web", "--", "--config=x"]);
		expect(buildCliLogger).toHaveBeenCalledWith(expect.anything(), { command: "run" });
		expect(createAstromech).toHaveBeenCalledWith({ cwd: "/repo", logger: "logger", config: { tasks: "config" } });
		expect(run).toHaveBeenCalledWith("audit", {
			job: "performance",
			passthrough: ["extra", "--config=x"],
			dryRun: false,
			required: true,
			filter: "web",
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("leaves out a job and a filter it was not given, and exits 1 for a failed or unknown task", async () => {
		run.mockReturnValue({ status: "unknown" });
		await go(["run", "test"]);
		const options = run.mock.calls[0]![1];
		expect("job" in options || "filter" in options).toBe(false);
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		run.mockReturnValue({ status: "fail" });
		await go(["run", "test"]);
		expect(process.exitCode).toBe(1);
	});

	it("treats `lint` with any other job as a plain task", async () => {
		await go(["run", "lint", "eslint"]);
		expect(buildCliLogger).toHaveBeenCalledWith(expect.anything(), { command: "run" });
		expect(run).toHaveBeenCalledWith("lint", expect.objectContaining({ job: "eslint" }));
		expect(lintCommitMsgFile).not.toHaveBeenCalled();
	});

	it("runs without a task manifest when the config cannot be read", async () => {
		loadTasksConfig.mockRejectedValue(new Error("no config"));
		await go(["run", "build"]);
		expect(createAstromech).toHaveBeenCalledWith(expect.objectContaining({ config: undefined }));
	});

	it("runs `ci` as the merge-gating suite: the required checks, or all of them with --all", async () => {
		await go(["run", "ci"]);
		expect(buildCliLogger).toHaveBeenCalledWith(expect.anything(), { command: "run ci" });
		expect(ci).toHaveBeenCalledWith({ dryRun: false, scope: "required" });
		await go(["run", "ci", "--all", "--filter", "web", "--dry-run"]);
		expect(ci).toHaveBeenLastCalledWith({ dryRun: true, scope: "all", filter: "web" });
		expect(run).not.toHaveBeenCalled();
	});

	it("exits 1 when `ci` failed, and runs it without a manifest when the config cannot be read", async () => {
		loadTasksConfig.mockRejectedValue(new Error("no config"));
		ci.mockReturnValue({ status: "fail" });
		await go(["run", "ci"]);
		expect(createAstromech).toHaveBeenCalledWith(expect.objectContaining({ config: undefined }));
		expect(process.exitCode).toBe(1);
	});

	it("lints the commit message file git passes, and prints each violation", async () => {
		await go(["run", "lint", "commit-msg", "--", ".git/COMMIT_EDITMSG"]);
		expect(buildCliLogger).toHaveBeenCalledWith(expect.anything(), { command: "run lint commit-msg" });
		expect(lintCommitMsgFile).toHaveBeenCalledWith(".git/COMMIT_EDITMSG", "/repo");
		expect(process.exitCode).toBeUndefined();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		lintCommitMsgFile.mockResolvedValue({
			valid: false,
			violations: [{ rule: "header-max-length", message: "too long" }],
		});
		await go(["run", "lint", "commit-msg", "--", "msg"]);
		expect(error).toHaveBeenCalledWith("✖ header-max-length: too long");
		expect(process.exitCode).toBe(1);
		error.mockRestore();
	});

	it("says the file is missing when `lint commit-msg` is given none", async () => {
		await go(["run", "lint", "commit-msg"]);
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining("missing <file>"));
		expect(lintCommitMsgFile).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});
});
