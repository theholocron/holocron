import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runProvider = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./provider.js", () => ({ runProvider }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_argv: unknown, config: { org?: string }) => config.org,
}));

import yargs from "yargs";

import { providerCommand } from "./provider.command.js";

const argv = (over: Record<string, unknown> = {}) =>
	({ cwd: "/repo", dryRun: false, yes: false, token: undefined, ...over }) as never;
const run = (over?: Record<string, unknown>) => (providerCommand.handler as (a: never) => Promise<void>)(argv(over));

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" } });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runProvider.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => {
	process.exitCode = undefined;
});

describe("provider command", () => {
	it("is `provider [provider] [action]`", () => {
		expect(providerCommand.command).toBe("provider [provider] [action]");
	});

	it("reads the provider and action as positionals, and --yes", async () => {
		await yargs(["provider", "linear", "setup", "--yes", "--cwd", "/repo"])
			.option("cwd", { type: "string" })
			.option("dry-run", { type: "boolean", default: false })
			.command(providerCommand as never)
			.parseAsync();
		expect(runProvider.mock.calls[0]![0]).toMatchObject({ provider: "linear", action: "setup", yes: true });
	});

	it("stops without loading anything when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(loadConfig).not.toHaveBeenCalled();
		expect(runProvider).not.toHaveBeenCalled();
	});

	it("passes the tokens, the org and --dry-run on", async () => {
		await run({ provider: "linear", action: "doctor", dryRun: true });
		expect(runProvider.mock.calls[0]![0]).toMatchObject({
			provider: "linear",
			action: "doctor",
			yes: false,
			context: { repoRoot: "/repo", dryRun: true, cliToken: "t", org: "acme" },
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("leaves out a provider and action it was not given, and exits 1 on a failure", async () => {
		runProvider.mockResolvedValue({ status: "fail", rows: [] });
		await run();
		const input = runProvider.mock.calls[0]![0];
		expect("provider" in input).toBe(false);
		expect("action" in input).toBe(false);
		expect(process.exitCode).toBe(1);
	});
});
