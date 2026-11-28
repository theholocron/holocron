import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSyncRequests = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-sync-requests/run-sync-requests.js", () => ({ runSyncRequests }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { syncCommand } from "../sync/sync.command.js";

const go = (...args: string[]) => runCommand(syncCommand, ["sync", "requests", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSyncRequests.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("sync requests", () => {
	it("passes the config, the context, --to, --check and --yes", async () => {
		await go("--to", "bruno", "--check", "--yes");
		expect(runSyncRequests).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "bruno",
				check: true,
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("passes --prefer, and refuses a word that is neither side", async () => {
		await go("--prefer", "workspace");
		expect(runSyncRequests.mock.calls[0]![0].prefer).toBe("workspace");
		await expect(go("--prefer", "bruno")).rejects.toThrow();
	});

	it("leaves the optional inputs out and passes dry-run when asked", async () => {
		await go("--dry-run");
		const input = runSyncRequests.mock.calls[0]![0];
		expect(input).not.toHaveProperty("to");
		expect(input).not.toHaveProperty("check");
		expect(input).not.toHaveProperty("prefer");
		expect(input).not.toHaveProperty("yes");
		expect(input.context.dryRun).toBe(true);
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go();
		expect(runSyncRequests).not.toHaveBeenCalled();
		runSyncRequests.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go();
		expect(process.exitCode).toBe(1);
	});
});
