import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctorNotifications = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor-notifications.js", () => ({ runDoctorNotifications }));
vi.mock("../../cli-support/index.js", () => ({
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
	parseScope: (s: string) => ({ parsed: s }),
}));

import yargs from "yargs";

import { doctorNotificationsCommand } from "./doctor-notifications.command.js";

const run = (over: Record<string, unknown> = {}) =>
	(doctorNotificationsCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", ...over } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runDoctorNotifications.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor notifications command", () => {
	it("passes only the flags that were given, with --scope parsed", async () => {
		await run();
		expect(runDoctorNotifications.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", org: "acme" },
		});
		await run({ scope: "env=stg", provider: "discord", builtOnly: true, deliver: true });
		expect(runDoctorNotifications.mock.calls[1]![0]).toMatchObject({
			scope: { parsed: "env=stg" },
			provider: "discord",
			builtOnly: true,
			deliver: true,
		});
	});

	it("reads its options from the command line, --built-only included", async () => {
		await yargs(["notifications", "--scope", "org=acme", "--provider", "discord", "--built-only", "--deliver"])
			.option("cwd", { type: "string", default: "/repo" })
			.command(doctorNotificationsCommand as never)
			.parseAsync();
		expect(runDoctorNotifications.mock.calls[0]![0]).toMatchObject({
			scope: { parsed: "org=acme" },
			provider: "discord",
			builtOnly: true,
			deliver: true,
		});
	});

	it("exits 1 when the check failed, and stops when --token cannot be parsed", async () => {
		runDoctorNotifications.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runDoctorNotifications.mockClear();
		await run();
		expect(runDoctorNotifications).not.toHaveBeenCalled();
	});
});
