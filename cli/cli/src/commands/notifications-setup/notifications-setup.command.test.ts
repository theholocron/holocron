import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runNotificationsSetup = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./index.js", () => ({ runNotificationsSetup }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { notificationsSetupCommand } from "./notifications-setup.command.js";

const go = (...args: string[]) => runCommand(notificationsSetupCommand, ["notifications", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runNotificationsSetup.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("notifications command", () => {
	it("passes --yes through, and leaves it out by default", async () => {
		await go("--yes");
		expect(runNotificationsSetup).toHaveBeenLastCalledWith(expect.objectContaining({ yes: true }));
		await go();
		expect(runNotificationsSetup).toHaveBeenLastCalledWith(expect.not.objectContaining({ yes: true }));
	});

	it("does nothing without tokens and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go();
		expect(runNotificationsSetup).not.toHaveBeenCalled();
		runNotificationsSetup.mockResolvedValueOnce({ status: "fail" });
		await go();
		expect(process.exitCode).toBe(1);
	});
});
