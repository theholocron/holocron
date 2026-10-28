import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runSyncGithub = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const report = vi.hoisted(() => vi.fn());
const resolveToken = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../sync-github/index.js", () => ({ runSyncGithub }));
vi.mock("../../observability/logger/index.js", () => ({ reportError: report }));
vi.mock("../../auth/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../auth/index.js")>()),
	createFeatureResolver: () => resolveToken,
}));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { AuthError } from "../../auth/index.js";
import { runCommand } from "../../testing/run-command.js";
import { syncGithubCommand } from "../sync-github/sync-github.command.js";
import { syncCommand } from "./sync.command.js";

beforeEach(() => {
	vi.clearAllMocks();
	tokenContext.mockReturnValue({ cliToken: "t" });
	resolveToken.mockReturnValue("sync-token");
	runSyncGithub.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("sync github", () => {
	it("is `sync github`, under `sync`", () => {
		expect(syncCommand.command).toBe("sync");
		expect(syncGithubCommand.command).toBe("github");
	});

	it("syncs with the sync token, passing the branch, PR, message and --dry-run", async () => {
		await runCommand(syncCommand, ["sync", "github", "--branch", "b", "--pr", "--message", "m", "--dry-run"]);
		expect(resolveToken).toHaveBeenCalledWith({ cliToken: "t" });
		expect(runSyncGithub.mock.calls[0]![0]).toMatchObject({
			token: "sync-token",
			dryRun: true,
			branch: "b",
			createPr: true,
			message: "m",
		});
	});

	it("needs no token for --output-dir, and leaves out the options it was not given", async () => {
		await runCommand(syncCommand, ["sync", "github", "--output-dir", "/out"]);
		expect(resolveToken).not.toHaveBeenCalled();
		const input = runSyncGithub.mock.calls[0]![0];
		expect(input).toMatchObject({ token: "no-token-needed", outputDir: "/out" });
		expect("branch" in input || "createPr" in input || "message" in input).toBe(false);
	});

	it("reports a missing token and exits 1, whatever kind of error it was", async () => {
		resolveToken.mockImplementationOnce(() => {
			throw new AuthError("no token");
		});
		await runCommand(syncCommand, ["sync", "github"]);
		expect(report).toHaveBeenCalledWith("sync-github: no token");
		expect(process.exitCode).toBe(1);
		resolveToken.mockImplementationOnce(() => {
			throw "plain";
		});
		await runCommand(syncCommand, ["sync", "github"]);
		expect(report).toHaveBeenLastCalledWith("sync-github: plain");
		expect(runSyncGithub).not.toHaveBeenCalled();
	});

	it("exits 1 when the sync failed, and stops when --token cannot be parsed", async () => {
		runSyncGithub.mockResolvedValue({ status: "fail" });
		await runCommand(syncCommand, ["sync", "github"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSyncGithub.mockClear();
		await runCommand(syncCommand, ["sync", "github"]);
		expect(runSyncGithub).not.toHaveBeenCalled();
	});

	it("a bare `sync` opens the menu of its subcommands", async () => {
		await runCommand(syncCommand, ["sync"]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"sync — choose a subcommand:",
			expect.any(String),
			["sync"]
		);
	});
});
