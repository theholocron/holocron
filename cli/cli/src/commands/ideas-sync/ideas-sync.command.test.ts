import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runIdeasSync = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-ideas-sync/run-ideas-sync.js", () => ({ runIdeasSync }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { ideasCommand } from "../ideas/index.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(ideasCommand, ["ideas", "sync", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runIdeasSync.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("ideas sync", () => {
	it("passes the config, the context and --yes", async () => {
		await go("--yes");
		expect(runIdeasSync).toHaveBeenCalledWith(
			expect.objectContaining({
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves yes out and passes dry-run when asked", async () => {
		await go("--dry-run");
		expect(runIdeasSync.mock.calls[0]![0]).not.toHaveProperty("yes");
		expect(runIdeasSync.mock.calls[0]![0].context.dryRun).toBe(true);
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go();
		expect(runIdeasSync).not.toHaveBeenCalled();
		runIdeasSync.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go();
		expect(process.exitCode).toBe(1);
	});
});
