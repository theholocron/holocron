import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorProject = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-project.js", () => ({ runDoctorProject }));
vi.mock("../../cli-support/index.js", () => ({
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { doctorProjectCommand } from "./doctor-project.command.js";

const run = (argv: object = {}) =>
	(doctorProjectCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", ...argv } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runDoctorProject.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor project command", () => {
	it("runs the check with the loaded config and the resolved org", async () => {
		await run();
		expect(runDoctorProject.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", org: "acme" },
		});
	});

	it("posts to #alerts on a bare --post and to the named channel otherwise", async () => {
		await run({ post: "" });
		expect(runDoctorProject.mock.calls[0]![0]).toMatchObject({ post: "alerts" });
		await run({ post: "deploys" });
		expect(runDoctorProject.mock.calls[1]![0]).toMatchObject({ post: "deploys" });
	});

	it("exits 1 on a failure, but not on a skip", async () => {
		runDoctorProject.mockResolvedValue({ status: "skip" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runDoctorProject.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runDoctorProject).not.toHaveBeenCalled();
	});

	it("is the `project` subcommand", () => {
		expect(doctorProjectCommand.command).toBe("project");
	});

	it("declares the --post option", () => {
		const y = { option: vi.fn() };
		y.option.mockReturnValue(y);
		(doctorProjectCommand.builder as (y: never) => unknown)(y as never);
		expect(y.option).toHaveBeenCalledWith("post", expect.objectContaining({ type: "string" }));
	});
});
