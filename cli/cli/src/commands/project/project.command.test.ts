import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runProjectList = vi.hoisted(() => vi.fn());
const runProjectCreate = vi.hoisted(() => vi.fn());
const runProjectClose = vi.hoisted(() => vi.fn());
const runProjectSetup = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./project-list/project-list.js", () => ({ runProjectList }));
vi.mock("./project-create/project-create.js", () => ({ runProjectCreate }));
vi.mock("./project-close/project-close.js", () => ({ runProjectClose }));
vi.mock("./project-setup/project-setup.js", () => ({ runProjectSetup }));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../run-command.testing.js";
import { projectCommand } from "./index.js";

const go = (...args: string[]) => runCommand(projectCommand, ["project", ...args]);
const ok = { status: "ok", summary: { ok: 1, fail: 0, skip: 0 } };

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	for (const run of [runProjectList, runProjectCreate, runProjectClose, runProjectSetup]) run.mockResolvedValue(ok);
});
afterEach(() => void (process.exitCode = undefined));

describe("project commands", () => {
	it("list passes the context and the --org flag", async () => {
		await go("list", "--org", "other");
		expect(runProjectList).toHaveBeenCalledWith(
			expect.objectContaining({
				owner: "other",
				context: expect.objectContaining({ repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" }),
			})
		);
	});

	it("create passes the template, title and --yes", async () => {
		await go("create", "roadmap", "--title", "v5", "--yes");
		expect(runProjectCreate).toHaveBeenCalledWith(
			expect.objectContaining({ template: "roadmap", title: "v5", yes: true })
		);
	});

	it("create runs without a template", async () => {
		await go("create");
		expect(runProjectCreate).toHaveBeenCalledWith(expect.objectContaining({ template: undefined }));
	});

	it("close takes a number as text", async () => {
		await go("close", "7", "--yes");
		expect(runProjectClose).toHaveBeenCalledWith(expect.objectContaining({ board: "7", yes: true }));
	});

	it("close needs a board", async () => {
		await expect(go("close")).rejects.toThrow();
		expect(runProjectClose).not.toHaveBeenCalled();
	});

	it("setup passes --dry-run", async () => {
		await runCommand(projectCommand, ["project", "setup", "--dry-run"]);
		expect(runProjectSetup).toHaveBeenCalledWith(
			expect.objectContaining({ context: expect.objectContaining({ dryRun: true }) })
		);
	});

	it("exits non-zero when a run fails", async () => {
		runProjectSetup.mockResolvedValue({ status: "fail", summary: { ok: 0, fail: 1, skip: 0 } });
		await go("setup");
		expect(process.exitCode).toBe(1);
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValue(undefined);
		await go("list");
		expect(runProjectList).not.toHaveBeenCalled();
	});

	it.each([
		["list", runProjectList, []],
		["create", runProjectCreate, ["roadmap"]],
		["close", runProjectClose, ["7"]],
		["setup", runProjectSetup, []],
	])("%s does nothing when the token flags are unusable", async (sub, run, rest) => {
		tokenContext.mockReturnValue(undefined);
		await go(sub, ...rest);
		expect(loadConfig).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it.each([
		["list", runProjectList, []],
		["create", runProjectCreate, ["roadmap"]],
		["close", runProjectClose, ["7"]],
		["setup", runProjectSetup, []],
	])("%s exits non-zero when the run fails and zero when it does not", async (sub, run, rest) => {
		await go(sub, ...rest);
		expect(process.exitCode).toBeUndefined();
		run.mockResolvedValue({ status: "fail", summary: { ok: 0, fail: 1, skip: 0 } });
		await go(sub, ...rest);
		expect(process.exitCode).toBe(1);
	});

	it("passes the --org flag as the owner for every subcommand", async () => {
		for (const [sub, run, rest] of [
			["create", runProjectCreate, ["roadmap"]],
			["close", runProjectClose, ["7"]],
			["setup", runProjectSetup, []],
		] as const) {
			await go(sub, ...rest, "--org", "other");
			expect(run).toHaveBeenCalledWith(
				expect.objectContaining({ owner: "other", context: expect.objectContaining({ org: "acme" }) })
			);
		}
	});

	it("the group itself has nothing to run", () => {
		expect(projectCommand.handler({} as never)).toBeUndefined();
	});
});
