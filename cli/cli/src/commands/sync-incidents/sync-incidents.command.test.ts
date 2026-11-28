import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSyncIncidents = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-sync-incidents/index.js", () => ({ runSyncIncidents }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { syncCommand } from "../sync/sync.command.js";

const go = (...args: string[]) => runCommand(syncCommand, ["sync", "incidents", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSyncIncidents.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("sync incidents", () => {
	it("passes the config, the context and --yes", async () => {
		await go("--yes");
		expect(runSyncIncidents).toHaveBeenCalledWith(
			expect.objectContaining({
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("turns --since into a time and passes --provider, and leaves them out otherwise", async () => {
		await go("--since", "2026-11-01", "--provider", "discord");
		expect(runSyncIncidents).toHaveBeenLastCalledWith(
			expect.objectContaining({ since: "2026-11-01T00:00:00.000Z", provider: "discord" })
		);
		await go();
		const call = runSyncIncidents.mock.calls.at(-1)?.[0] as Record<string, unknown>;
		expect(call).not.toHaveProperty("since");
		expect(call).not.toHaveProperty("yes");
	});

	it("exits 1 when the run fails and does nothing without tokens", async () => {
		runSyncIncidents.mockResolvedValue({ status: "fail" });
		await go();
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(undefined);
		runSyncIncidents.mockClear();
		await go();
		expect(runSyncIncidents).not.toHaveBeenCalled();
	});
});
