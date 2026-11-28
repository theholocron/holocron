import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runOpenRequests = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-open-requests/run-open-requests.js", () => ({ runOpenRequests }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { openCommand } from "../open/open.command.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(openCommand, ["open", "requests", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runOpenRequests.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("open requests", () => {
	it("passes the config, the context, --environment, --to and --yes", async () => {
		await go("--environment", "prod", "--environment", "dev", "--to", "bruno", "--yes");
		expect(runOpenRequests).toHaveBeenCalledWith(
			expect.objectContaining({
				environments: ["prod", "dev"],
				to: "bruno",
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves the optional inputs out and passes dry-run when asked", async () => {
		await go("--dry-run");
		const input = runOpenRequests.mock.calls[0]![0];
		expect(input).not.toHaveProperty("environments");
		expect(input).not.toHaveProperty("to");
		expect(input).not.toHaveProperty("yes");
		expect(input.context.dryRun).toBe(true);
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go();
		expect(runOpenRequests).not.toHaveBeenCalled();
		runOpenRequests.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go();
		expect(process.exitCode).toBe(1);
	});
});
