import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorLogs = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-logs.js", () => ({ runDoctorLogs }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { doctorLogsCommand } from "./doctor-logs.command.js";

const run = () => (doctorLogsCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo" } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runDoctorLogs.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor logs command", () => {
	it("runs the check with the loaded config and the resolved org", async () => {
		await run();
		expect(runDoctorLogs.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", org: "acme" },
		});
	});

	it("does nothing when the tokens cannot be parsed", async () => {
		tokenContext.mockReturnValue(undefined);
		await run();
		expect(runDoctorLogs).not.toHaveBeenCalled();
	});

	it("exits 1 on a failure, but not on a skip", async () => {
		runDoctorLogs.mockResolvedValue({ status: "skip" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runDoctorLogs.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});
});
