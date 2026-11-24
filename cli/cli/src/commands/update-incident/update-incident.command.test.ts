import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runUpdateIncident = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-update-incident/index.js", () => ({ runUpdateIncident }));
vi.mock("../update-incident/run-update-incident/index.js", () => ({ runUpdateIncident }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { closeCommand } from "../close/close.command.js";
import { runCommand } from "../run-command.testing.js";
import { updateCommand } from "../update/update.command.js";

const update = (...args: string[]) => runCommand(updateCommand, ["update", "incident", ...args]);
const close = (...args: string[]) => runCommand(closeCommand, ["close", "incident", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runUpdateIncident.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("update incident", () => {
	it("passes the id, the status, the message and the flags in update mode", async () => {
		await update("i1", "--status", "monitoring", "--message", "Fix is in", "--page", "P", "--no-notify", "--yes");
		expect(runUpdateIncident).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "update",
				id: "i1",
				status: "monitoring",
				message: "Fix is in",
				page: "P",
				notify: false,
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("notifies by default, leaves out --page and --yes, exits 1 on failure and does nothing without tokens", async () => {
		await update("i1", "--status", "identified", "--message", "x");
		const call = runUpdateIncident.mock.calls.at(-1)?.[0] as Record<string, unknown>;
		expect(call.notify).toBe(true);
		expect(call).not.toHaveProperty("page");
		expect(call).not.toHaveProperty("yes");
		runUpdateIncident.mockResolvedValue({ status: "fail" });
		await update("i1", "--status", "identified", "--message", "x");
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		runUpdateIncident.mockClear();
		tokenContext.mockReturnValue(undefined);
		await update("i1", "--status", "identified", "--message", "x");
		expect(runUpdateIncident).not.toHaveBeenCalled();
	});
});

describe("close incident", () => {
	it("runs in close mode with the id and the message", async () => {
		await close("i1", "--message", "All clear", "--page", "P", "--no-notify", "--yes");
		expect(runUpdateIncident).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "close",
				id: "i1",
				message: "All clear",
				page: "P",
				notify: false,
				yes: true,
			})
		);
	});

	it("leaves out what was not given, exits 1 on failure and does nothing without tokens", async () => {
		await close("i1");
		const call = runUpdateIncident.mock.calls.at(-1)?.[0] as Record<string, unknown>;
		expect(call).toMatchObject({ mode: "close", notify: true });
		for (const key of ["page", "message", "yes"]) expect(call).not.toHaveProperty(key);
		runUpdateIncident.mockResolvedValue({ status: "fail" });
		await close("i1");
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		runUpdateIncident.mockClear();
		tokenContext.mockReturnValue(undefined);
		await close("i1");
		expect(runUpdateIncident).not.toHaveBeenCalled();
	});
});
