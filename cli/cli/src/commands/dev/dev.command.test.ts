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

const DEV = {
	environment: "Sentinel - dev",
	tunnel: { name: "sentinel-dev", hostname: "sentinel-dev.example.dev" },
	port: 4000,
	command: ["pnpm", "run", "serve"],
};
const go = (...rest: string[]) => runCommand(devCommand, ["dev", ...rest]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme", dev: DEV }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runDev.mockResolvedValue({ status: "ok", summary: { ok: 1, fail: 0 } });
});
afterEach(() => void (process.exitCode = undefined));

describe("dev command", () => {
	it("runs from the dev block of the config alone, with the context from the tokens and the org", async () => {
		await go();
		expect(runDev).toHaveBeenCalledWith(
			expect.objectContaining({
				environment: "Sentinel - dev",
				name: "sentinel-dev",
				hostname: "sentinel-dev.example.dev",
				port: 4000,
				command: ["pnpm", "run", "serve"],
				context: expect.objectContaining({ repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" }),
			})
		);
	});

	it("lets flags and a command after -- win over the config", async () => {
		await go(
			"--environment",
			"E",
			"--name",
			"n",
			"--hostname",
			"h.example.dev",
			"--port",
			"5000",
			"--",
			"node",
			"app.js"
		);
		expect(runDev).toHaveBeenCalledWith(
			expect.objectContaining({
				environment: "E",
				name: "n",
				hostname: "h.example.dev",
				port: 5000,
				command: ["node", "app.js"],
			})
		);
	});

	it("says what is missing when neither the config nor the flags give it", async () => {
		loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
		await expect(go()).rejects.toThrow(/^dev needs an environment/);
		expect(runDev).not.toHaveBeenCalled();
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValue(undefined);
		await go();
		expect(runDev).not.toHaveBeenCalled();
	});

	it("exits non-zero when it fails", async () => {
		runDev.mockResolvedValue({ status: "fail", summary: { ok: 0, fail: 1 } });
		await go();
		expect(process.exitCode).toBe(1);
	});
});
