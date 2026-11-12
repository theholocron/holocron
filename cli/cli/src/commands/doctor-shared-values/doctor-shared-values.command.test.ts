import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorSharedValues = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-shared-values.js", () => ({ runDoctorSharedValues }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { doctorSharedValuesCommand } from "./doctor-shared-values.command.js";

const run = (argv: Record<string, unknown> = {}) =>
	(doctorSharedValuesCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", ...argv } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runDoctorSharedValues.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor shared-values command", () => {
	it("runs the check with the loaded config, the org, and no strictness or allow-list by default", async () => {
		await run();
		expect(runDoctorSharedValues.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", org: "acme" },
			strict: false,
			allow: [],
		});
	});

	it("passes --strict and every --allow", async () => {
		await run({ strict: true, allow: ["A", "B"] });
		expect(runDoctorSharedValues.mock.calls[0]![0]).toMatchObject({ strict: true, allow: ["A", "B"] });
	});

	it("exits 1 on a failure, but not on a skip", async () => {
		runDoctorSharedValues.mockResolvedValue({ status: "skip" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runDoctorSharedValues.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runDoctorSharedValues).not.toHaveBeenCalled();
	});

	it("is the `shared-values` subcommand with --strict and a repeatable --allow", () => {
		expect(doctorSharedValuesCommand.command).toBe("shared-values");
		const options: Record<string, unknown> = {};
		const yargs = {
			option(name: string, spec: unknown) {
				options[name] = spec;
				return yargs;
			},
		};
		(doctorSharedValuesCommand.builder as (y: unknown) => unknown)(yargs);
		expect(options.strict).toMatchObject({ type: "boolean", default: false });
		expect(options.allow).toMatchObject({ type: "string", array: true });
	});
});
