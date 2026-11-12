import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runSync = vi.hoisted(() => vi.fn());
const runSyncReadme = vi.hoisted(() => vi.fn());
const runSyncGithub = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const report = vi.hoisted(() => vi.fn());
const resolveToken = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./sync.js", () => ({ runSync }));
vi.mock("../sync-readme/index.js", () => ({ runSyncReadme }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../sync-github/index.js", () => ({ runSyncGithub }));
vi.mock("../../observability/logger/index.js", () => ({ reportError: report }));
vi.mock("../../auth/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../auth/index.js")>()),
	createFeatureResolver: () => resolveToken,
}));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));

import { AuthError } from "../../auth/index.js";
import { runCommand } from "../run-command.testing.js";
import { syncGithubCommand } from "../sync-github/sync-github.command.js";
import { syncCommand } from "./sync.command.js";

const summary = (fail: number) => ({ summary: { ok: 1, fail, skip: 0 } });

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	runSync.mockResolvedValue(summary(0));
	runSyncReadme.mockResolvedValue({ status: "ok" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	resolveToken.mockReturnValue("sync-token");
	runSyncGithub.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("sync github", () => {
	it("is `sync github`, under `sync`", () => {
		expect(syncCommand.command).toBe("sync [steps..]");
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
});

describe("sync", () => {
	it("syncs the named steps, or all of them, for --repo", async () => {
		await runCommand(syncCommand, ["sync", "labels", "topics", "--repo", "acme/widgets"]);
		expect(runSync.mock.calls[0]![0]).toMatchObject({
			steps: ["labels", "topics"],
			context: { repo: "acme/widgets", cliToken: "t", org: "acme" },
		});
		await runCommand(syncCommand, ["sync"]);
		const bare = runSync.mock.calls[1]![0];
		expect("steps" in bare || "repo" in bare.context).toBe(false);
	});

	it("exits 1 when a step failed, and stops when --token cannot be parsed", async () => {
		runSync.mockResolvedValue(summary(1));
		await runCommand(syncCommand, ["sync"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSync.mockClear();
		await runCommand(syncCommand, ["sync"]);
		expect(runSync).not.toHaveBeenCalled();
	});

	it("`sync readme` updates the README, and reports why it failed", async () => {
		await runCommand(syncCommand, ["sync", "readme", "--dry-run"]);
		expect(runSyncReadme).toHaveBeenCalledWith({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", dryRun: true },
		});
		runSyncReadme.mockResolvedValue({ status: "fail", message: "no package.json" });
		await runCommand(syncCommand, ["sync", "readme"]);
		expect(report).toHaveBeenCalledWith("sync readme: no package.json");
		expect(process.exitCode).toBe(1);
		report.mockClear();
		runSyncReadme.mockResolvedValue({ status: "fail" });
		await runCommand(syncCommand, ["sync", "readme"]);
		expect(report).not.toHaveBeenCalled();
	});
});
