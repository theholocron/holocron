import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorCi = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-ci.js", () => ({ runDoctorCi }));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));

import { doctorCiCommand } from "./doctor-ci.command.js";

const run = () => (doctorCiCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo" } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: {}, filepath: "/x" });
	runDoctorCi.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor ci command", () => {
	it("runs the check with the loaded config and the working folder", async () => {
		await run();
		expect(runDoctorCi.mock.calls[0]![0]).toEqual({
			loaded: { resolved: {}, filepath: "/x" },
			context: { repoRoot: "/repo" },
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("exits 1 on a failure", async () => {
		runDoctorCi.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("is the `ci` subcommand", () => {
		expect(doctorCiCommand.command).toBe("ci");
	});
});
