import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorVariables = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-variables.js", () => ({ runDoctorVariables }));
vi.mock("../../cli-support/index.js", () => ({
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { doctorVariablesCommand } from "./doctor-variables.command.js";

const run = () => (doctorVariablesCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo" } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runDoctorVariables.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor variables command", () => {
	it("runs the check with the loaded config and the resolved org", async () => {
		await run();
		expect(runDoctorVariables.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", org: "acme" },
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("exits 1 on a failure, but not on a skip", async () => {
		runDoctorVariables.mockResolvedValue({ status: "skip" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runDoctorVariables.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runDoctorVariables).not.toHaveBeenCalled();
	});

	it("is the `variables` subcommand", () => {
		expect(doctorVariablesCommand.command).toBe("variables");
	});
});
