import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSyncIssues = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-sync-issues/run-sync-issues.js", () => ({ runSyncIssues }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { syncCommand } from "../sync/sync.command.js";

const go = (...args: string[]) => runCommand(syncCommand, ["sync", "issues", ...args]);
const ENDS = ["--from", "github", "--to", "linear:team=ENG"];

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSyncIssues.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("sync issues", () => {
	it("passes both ends, the context and --yes", async () => {
		await go(...ENDS, "--yes");
		expect(runSyncIssues).toHaveBeenCalledWith(
			expect.objectContaining({
				from: "github",
				to: "linear:team=ENG",
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
		expect(runSyncIssues.mock.calls[0]![0]).not.toHaveProperty("since");
	});

	it("turns --since into a timestamp", async () => {
		await go(...ENDS, "--since", "2026-03-01");
		expect(runSyncIssues).toHaveBeenCalledWith(expect.objectContaining({ since: "2026-03-01T00:00:00.000Z" }));
	});

	it("rejects a --since it cannot read before doing anything", async () => {
		await expect(go(...ENDS, "--since", "soon")).rejects.toThrow(/--since/);
		expect(runSyncIssues).not.toHaveBeenCalled();
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go(...ENDS);
		expect(runSyncIssues).not.toHaveBeenCalled();
		runSyncIssues.mockResolvedValueOnce({ status: "fail" });
		await go(...ENDS);
		expect(process.exitCode).toBe(1);
	});
});
