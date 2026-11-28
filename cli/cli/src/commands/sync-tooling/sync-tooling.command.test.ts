import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSyncTooling = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-sync-tooling/run-sync-tooling.js", () => ({ runSyncTooling }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { syncCommand } from "../sync/sync.command.js";

const go = (...args: string[]) => runCommand(syncCommand, ["sync", "tooling", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSyncTooling.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("sync tooling", () => {
	it("passes the config and the context", async () => {
		await go();
		expect(runSyncTooling).toHaveBeenCalledWith(
			expect.objectContaining({
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("passes dry-run when asked", async () => {
		await go("--dry-run");
		expect(runSyncTooling.mock.calls[0]![0].context.dryRun).toBe(true);
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go();
		expect(runSyncTooling).not.toHaveBeenCalled();
		runSyncTooling.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go();
		expect(process.exitCode).toBe(1);
	});
});
