import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runTunnelUp = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./tunnel-up.js", () => ({ runTunnelUp }));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../run-command.testing.js";
import { tunnelCommand } from "../tunnel/index.js";

const go = (args: string[]) =>
	runCommand(tunnelCommand, ["tunnel", "up", "--name", "n", "--hostname", "h.example.dev", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runTunnelUp.mockResolvedValue({ status: "ok", summary: { ok: 2, fail: 0 } });
});
afterEach(() => void (process.exitCode = undefined));

describe("tunnel up command", () => {
	it("passes the options with the context from the tokens and the org", async () => {
		await go(["--port", "4000", "--run"]);
		expect(runTunnelUp).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "n",
				hostname: "h.example.dev",
				port: 4000,
				run: true,
				context: expect.objectContaining({ repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" }),
			})
		);
	});

	it("defaults to port 3000 and not running the tunnel", async () => {
		await go([]);
		expect(runTunnelUp).toHaveBeenCalledWith(expect.objectContaining({ port: 3000, run: false }));
	});

	it("needs a name and a hostname", async () => {
		await expect(runCommand(tunnelCommand, ["tunnel", "up"])).rejects.toThrow(/Missing required/);
		expect(runTunnelUp).not.toHaveBeenCalled();
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValue(undefined);
		await go([]);
		expect(runTunnelUp).not.toHaveBeenCalled();
	});

	it("exits non-zero when it fails", async () => {
		runTunnelUp.mockResolvedValue({ status: "fail", summary: { ok: 0, fail: 1 } });
		await go([]);
		expect(process.exitCode).toBe(1);
	});
});
