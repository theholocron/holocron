import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loaded = { resolved: { name: "demo", org: "acme" }, filepath: "/x/holocron.config.json" };
const loadConfig = vi.hoisted(() => vi.fn());
const runProbeCommand = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
const tokenContext = vi.hoisted(() => vi.fn());
const applyResolvedConfig = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./probe.js", () => ({ runProbeCommand }));
vi.mock("../../interactive-menu/index.js", () => ({
	buildProbeMenuEntries: (groups: unknown) => ["entries", groups],
	launchMenu,
}));
vi.mock("../../cli-support/index.js", () => ({
	tokenContext,
	applyResolvedConfig,
	resolveOrg: (_argv: unknown, config: { org?: string }) => config.org,
}));

import yargs from "yargs";

import { probeCommand } from "./probe.command.js";

const argv = (over: Record<string, unknown> = {}) =>
	({ cwd: "/repo", dryRun: false, yes: false, token: undefined, ...over }) as never;
const run = (over?: Record<string, unknown>) => (probeCommand.handler as (a: never) => Promise<void>)(argv(over));

const stdin = (value: boolean | undefined) =>
	Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue(loaded);
	tokenContext.mockReturnValue({ cliToken: "t" });
	runProbeCommand.mockResolvedValue({ status: "ok" });
	stdin(false);
});
afterEach(() => {
	process.exitCode = undefined;
	stdin(undefined);
});

describe("probe command", () => {
	it("is `probe [provider] [probe] [args..]`", () => {
		expect(probeCommand.command).toBe("probe [provider] [probe] [args..]");
	});

	it("reads the provider and probe as positionals, and --yes", async () => {
		await yargs(["probe", "sentry", "rules", "--yes", "--cwd", "/repo"])
			.option("cwd", { type: "string" })
			.option("dry-run", { type: "boolean", default: false })
			.command(probeCommand as never)
			.parseAsync();
		expect(runProbeCommand.mock.calls[0]![0]).toMatchObject({ provider: "sentry", probe: "rules", yes: true });
	});

	it("stops without loading anything when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(loadConfig).not.toHaveBeenCalled();
		expect(runProbeCommand).not.toHaveBeenCalled();
	});

	it("runs the probe with the tokens, the org, --dry-run and --yes, and no menu without a terminal", async () => {
		await run({ provider: "sentry", probe: "rules", dryRun: true, yes: true });
		expect(applyResolvedConfig).toHaveBeenCalled();
		const input = runProbeCommand.mock.calls[0]![0];
		expect(input).toMatchObject({
			provider: "sentry",
			probe: "rules",
			dryRun: true,
			yes: true,
			context: { repoRoot: "/repo", dryRun: true, cliToken: "t", org: "acme" },
		});
		expect(input.pick).toBeUndefined();
		expect(process.exitCode).toBeUndefined();
	});

	it("passes the arguments after the probe name on, as strings", async () => {
		await run({ provider: "deps", probe: "who", args: ["vitest", 2] });
		expect(runProbeCommand.mock.calls[0]![0]).toMatchObject({ args: ["vitest", "2"] });
	});

	it("passes --lcov on, and leaves it out when not given", async () => {
		await run({ provider: "docs", probe: "patch", lcov: "coverage/docs.lcov" });
		expect(runProbeCommand.mock.calls[0]![0]).toMatchObject({ lcov: "coverage/docs.lcov" });
		await run({ provider: "docs", probe: "patch" });
		expect("lcov" in runProbeCommand.mock.calls[1]![0]).toBe(false);
	});

	it("reads --lcov as an option", async () => {
		await yargs(["probe", "docs", "patch", "--lcov", "out.lcov", "--cwd", "/repo"])
			.option("cwd", { type: "string" })
			.option("dry-run", { type: "boolean", default: false })
			.command(probeCommand as never)
			.parseAsync();
		expect(runProbeCommand.mock.calls[0]![0]).toMatchObject({ provider: "docs", probe: "patch", lcov: "out.lcov" });
	});

	it("leaves out a provider and probe it was not given, and exits 1 when the probes failed", async () => {
		runProbeCommand.mockResolvedValue({ status: "fail" });
		await run();
		const input = runProbeCommand.mock.calls[0]![0];
		expect("provider" in input).toBe(false);
		expect("probe" in input).toBe(false);
		expect(process.exitCode).toBe(1);
	});

	it("opens a menu of the probes on a terminal", async () => {
		stdin(true);
		await run();
		const groups = new Map();
		await runProbeCommand.mock.calls[0]![0].pick(groups);
		expect(launchMenu).toHaveBeenCalledWith(
			["entries", groups],
			expect.objectContaining({ cwd: "/repo" }),
			"probe — choose a provider:",
			"Run `holocron probe` to list the probes.",
			["probe"]
		);
	});
});
