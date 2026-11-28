import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorReleases = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-releases.js", () => ({ runDoctorReleases }));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));

import { doctorReleasesCommand } from "./doctor-releases.command.js";

const run = () => (doctorReleasesCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo" } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: {}, filepath: "/x" });
	runDoctorReleases.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor releases command", () => {
	it("runs the check with the loaded config and the working folder", async () => {
		await run();
		expect(runDoctorReleases.mock.calls[0]![0]).toEqual({
			loaded: { resolved: {}, filepath: "/x" },
			context: { repoRoot: "/repo" },
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("exits 1 on a failure, but not on a skip", async () => {
		runDoctorReleases.mockResolvedValue({ status: "skip" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runDoctorReleases.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("is the `releases` subcommand", () => {
		expect(doctorReleasesCommand.command).toBe("releases");
	});
});
