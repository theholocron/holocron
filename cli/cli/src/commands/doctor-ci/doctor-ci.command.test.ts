import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorCi = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-ci.js", () => ({ runDoctorCi }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { doctorCiCommand } from "./doctor-ci.command.js";
import { doctorCiEntry } from "./doctor-ci.entry.js";

const run = (argv: Record<string, unknown> = {}) =>
	(doctorCiCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", ...argv } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runDoctorCi.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor ci command", () => {
	it("runs the check with the loaded config and the working folder, and needs no token", async () => {
		await run();
		expect(runDoctorCi.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo" },
		});
		expect(tokenContext).not.toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
	});

	it("passes the shadow comparison, its limit, the token and the org", async () => {
		await run({ shadow: true, limit: "12", token: ["x"] });
		expect(runDoctorCi.mock.calls[0]![0]).toMatchObject({
			shadow: true,
			shadowLimit: 12,
			context: { repoRoot: "/repo", cliToken: "t", org: "acme" },
		});
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await run({ shadow: true });
		expect(runDoctorCi).not.toHaveBeenCalled();
	});

	it("exits 1 on a failure", async () => {
		runDoctorCi.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("declares --shadow and --limit", () => {
		const declared: string[] = [];
		const y = {
			option: vi.fn((name: string) => {
				declared.push(name);
				return y;
			}),
		};
		(doctorCiCommand.builder as (y: unknown) => unknown)(y);
		expect(declared).toEqual(["shadow", "limit"]);
	});

	it("is the `ci` subcommand, with the shadow offered in the menu", () => {
		expect(doctorCiCommand.command).toBe("ci");
		expect(doctorCiEntry.options?.map((o) => o.key)).toEqual(["shadow"]);
	});
});
