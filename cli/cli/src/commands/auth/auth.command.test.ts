import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runAuthSet = vi.hoisted(() => vi.fn(async () => ({ status: "ok" })));
const runAuthUnset = vi.hoisted(() => vi.fn());
const runAuthCheck = vi.hoisted(() => vi.fn(async () => ({ status: "ok" })));
const runAuthList = vi.hoisted(() => vi.fn(async () => {}));
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
const loadConfig = vi.hoisted(() => vi.fn(async (_cwd: string): Promise<unknown> => ({ resolved: { providers: {} } })));
vi.mock("./index.js", () => ({ runAuthSet, runAuthUnset, runAuthCheck, runAuthList }));
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("@theholocron/kyber/prompts", () => ({
	promptForPositionals: async (_entry: unknown, argv: Record<string, unknown>) => [argv["provider"]],
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	getEntry: (name: string) => name,
	launchMenu,
}));

import { checkCommand } from "../check/check.command.js";
import { listCommand } from "../list/list.command.js";
import { newCommand } from "../new/new.command.js";
import { removeCommand } from "../remove/remove.command.js";
import { runCommand } from "../run-command.testing.js";
import { authCheckCommand } from "./auth-check.command.js";
import { authListCommand } from "./auth-list.command.js";
import { authSetCommand } from "./auth-set.command.js";
import { authUnsetCommand } from "./auth-unset.command.js";

beforeEach(() => vi.clearAllMocks());
afterEach(() => void (process.exitCode = undefined));

describe("auth commands", () => {
	it("`new token` stores a token for the provider, with the positional value and the org", async () => {
		await runCommand(newCommand, ["new", "token", "github", "tok", "--org", "acme"]);
		expect(runAuthSet).toHaveBeenCalledWith({ provider: "github", positional: "tok", org: "acme" });
		runAuthSet.mockClear();
		await runCommand(newCommand, ["new", "token", "github"]);
		expect(runAuthSet).toHaveBeenCalledWith({ provider: "github" });
	});

	it("`new token` passes the credentials provider and environment the config names", async () => {
		loadConfig.mockResolvedValueOnce({
			resolved: {
				providers: { credentials: { cardinality: "many", tuples: [{ provider: "1password", options: {} }] } },
				credentials: { environment: "Demo" },
			},
		});
		await runCommand(newCommand, ["new", "token", "github"]);
		expect(runAuthSet).toHaveBeenCalledWith({
			provider: "github",
			credentials: { provider: "1password", environment: "Demo" },
		});
	});

	it("`new token` passes no credentials when the config has none or there is no config", async () => {
		loadConfig.mockResolvedValueOnce({ resolved: { providers: {} } });
		await runCommand(newCommand, ["new", "token", "github"]);
		expect(runAuthSet).toHaveBeenLastCalledWith({ provider: "github" });
		loadConfig.mockRejectedValueOnce(new Error("no holocron.config found"));
		await runCommand(newCommand, ["new", "token", "github"]);
		expect(runAuthSet).toHaveBeenLastCalledWith({ provider: "github" });
	});

	it("`new token` exits 1 when storing failed", async () => {
		runAuthSet.mockResolvedValueOnce({ status: "fail" });
		await runCommand(newCommand, ["new", "token", "github"]);
		expect(process.exitCode).toBe(1);
	});

	it("`remove token` removes the provider's token", async () => {
		await runCommand(removeCommand, ["remove", "token", "github"]);
		expect(runAuthUnset).toHaveBeenCalledWith({ provider: "github" });
	});

	it("`check token` re-verifies, passing the org, and exits 1 on failure", async () => {
		await runCommand(checkCommand, ["check", "token", "github", "--org", "acme"]);
		expect(runAuthCheck).toHaveBeenCalledWith({ provider: "github", org: "acme" });
		runAuthCheck.mockResolvedValueOnce({ status: "fail" });
		await runCommand(checkCommand, ["check", "token", "github"]);
		expect(runAuthCheck).toHaveBeenLastCalledWith({ provider: "github" });
		expect(process.exitCode).toBe(1);
	});

	it("`list tokens` lists the stored tokens", async () => {
		await runCommand(listCommand, ["list", "tokens"]);
		expect(runAuthList).toHaveBeenCalled();
	});

	it("a bare `check` opens the menu of its subcommands", async () => {
		await runCommand(checkCommand, ["check"]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ pickMessage: "check — choose a subcommand:", startPath: ["check"] })
		);
	});

	it("names each subcommand the way it is typed", () => {
		expect([authSetCommand, authUnsetCommand, authCheckCommand, authListCommand].map((c) => c.command)).toEqual([
			"token [provider] [value]",
			"token [provider]",
			"token [provider]",
			"tokens",
		]);
	});
});
