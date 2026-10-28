import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDoctor = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./doctor.js", () => ({ runDoctor }));
vi.mock("../../cli-support/index.js", () => ({
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../doctor-notifications/index.js", () => ({ doctorNotificationsCommand: { command: "notifications" } }));

import yargs from "yargs";

import { doctorCommand } from "./doctor.command.js";

const run = (over: Record<string, unknown> = {}) =>
	(doctorCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", dryRun: false, ...over } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runDoctor.mockResolvedValue({ summary: { ok: 1, fail: 0, skip: 0 } });
});
afterEach(() => void (process.exitCode = undefined));

describe("doctor command", () => {
	it("runs the smoke checks with the tokens, the org and --repo", async () => {
		await run({ repo: "acme/widgets", dryRun: true });
		expect(runDoctor.mock.calls[0]![0].context).toEqual({
			repoRoot: "/repo",
			dryRun: true,
			repo: "acme/widgets",
			cliToken: "t",
			org: "acme",
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("reads --repo", async () => {
		await yargs(["doctor", "--repo", "acme/widgets", "--cwd", "/repo"])
			.option("cwd", { type: "string" })
			.option("dry-run", { type: "boolean", default: false })
			.command(doctorCommand as never)
			.parseAsync();
		expect(runDoctor.mock.calls[0]![0].context.repo).toBe("acme/widgets");
	});

	it("leaves out --repo when it was not given, and exits 1 when a check failed", async () => {
		runDoctor.mockResolvedValue({ summary: { ok: 0, fail: 2, skip: 0 } });
		await run();
		expect("repo" in runDoctor.mock.calls[0]![0].context).toBe(false);
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runDoctor).not.toHaveBeenCalled();
	});
});
