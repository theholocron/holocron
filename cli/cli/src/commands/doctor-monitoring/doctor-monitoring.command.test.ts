import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorMonitoring = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-monitoring.js", () => ({ runDoctorMonitoring }));
vi.mock("../../cli-support/index.js", () => ({ tokenContext, applyResolvedConfig: vi.fn() }));

import { doctorMonitoringCommand } from "./doctor-monitoring.command.js";

const run = () => (doctorMonitoringCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo" } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: {}, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runDoctorMonitoring.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor monitoring command", () => {
	it("runs the check with the loaded config", async () => {
		await run();
		expect(runDoctorMonitoring.mock.calls[0]![0]).toEqual({
			loaded: { resolved: {}, filepath: "/x" },
			context: { repoRoot: "/repo" },
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("exits 1 on a failure, but not on a skip", async () => {
		runDoctorMonitoring.mockResolvedValue({ status: "skip" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runDoctorMonitoring.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runDoctorMonitoring).not.toHaveBeenCalled();
	});

	it("is the `monitoring` subcommand", () => {
		expect(doctorMonitoringCommand.command).toBe("monitoring");
	});
});
