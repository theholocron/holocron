import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runNewIncident = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-new-incident/index.js", () => ({ runNewIncident }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { newCommand } from "../new/new.command.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(newCommand, ["new", "incident", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runNewIncident.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("new incident", () => {
	it("passes the title, the context and every flag", async () => {
		await go(
			"Sentinel down",
			"--page",
			"The Holocron",
			"--status",
			"identified",
			"--component",
			"Sentinel=major",
			"--component",
			"Docs=degraded",
			"--message",
			"Found it",
			"--no-notify",
			"--allow-duplicate",
			"--yes"
		);
		expect(runNewIncident).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Sentinel down",
				page: "The Holocron",
				status: "identified",
				components: ["Sentinel=major", "Docs=degraded"],
				message: "Found it",
				notify: false,
				allowDuplicate: true,
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves out what was not given and notifies by default", async () => {
		await go("Down");
		const call = runNewIncident.mock.calls.at(-1)?.[0] as Record<string, unknown>;
		expect(call.notify).toBe(true);
		for (const key of ["page", "status", "components", "message", "allowDuplicate", "yes"]) {
			expect(call).not.toHaveProperty(key);
		}
	});

	it("passes an empty message through, exits 1 on a failed run and does nothing without tokens", async () => {
		await go("Down", "--message", "");
		expect(runNewIncident).toHaveBeenLastCalledWith(expect.objectContaining({ message: "" }));
		runNewIncident.mockResolvedValue({ status: "fail" });
		await go("Down");
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		runNewIncident.mockClear();
		tokenContext.mockReturnValue(undefined);
		await go("Down");
		expect(runNewIncident).not.toHaveBeenCalled();
	});
});
