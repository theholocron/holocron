import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runDev = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./dev.js", () => ({ runDev }));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../../testing/run-command.js";
import { devCommand } from "./dev.command.js";

const options = ["--environment", "Sentinel - dev", "--name", "n", "--hostname", "h.example.dev"];
const go = (...rest: string[]) => runCommand(devCommand, ["dev", ...options, ...rest]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runDev.mockResolvedValue({ status: "ok", summary: { ok: 1, fail: 0 } });
});
afterEach(() => void (process.exitCode = undefined));

describe("dev command", () => {
	it("passes the options and the command after --, with the context from the tokens and the org", async () => {
		await go("--port", "4000", "--", "pnpm", "run", "serve");
		expect(runDev).toHaveBeenCalledWith(
			expect.objectContaining({
				environment: "Sentinel - dev",
				name: "n",
				hostname: "h.example.dev",
				port: 4000,
				command: ["pnpm", "run", "serve"],
				context: expect.objectContaining({ repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" }),
			})
		);
	});

	it("defaults to port 3000", async () => {
		await go("--", "node", "app.js");
		expect(runDev).toHaveBeenCalledWith(expect.objectContaining({ port: 3000 }));
	});

	it("needs the application's command after --", async () => {
		await expect(go()).rejects.toThrow(/needs the application's command after --/);
		expect(runDev).not.toHaveBeenCalled();
	});

	it("needs an environment, a name and a hostname", async () => {
		await expect(runCommand(devCommand, ["dev", "--", "node"])).rejects.toThrow(/Missing required/);
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValue(undefined);
		await go("--", "node", "app.js");
		expect(runDev).not.toHaveBeenCalled();
	});

	it("exits non-zero when it fails", async () => {
		runDev.mockResolvedValue({ status: "fail", summary: { ok: 0, fail: 1 } });
		await go("--", "node", "app.js");
		expect(process.exitCode).toBe(1);
	});
});
