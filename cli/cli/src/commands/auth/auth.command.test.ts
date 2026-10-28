import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runAuthSet = vi.hoisted(() => vi.fn(async () => ({ status: "ok" })));
const runAuthUnset = vi.hoisted(() => vi.fn());
const runAuthCheck = vi.hoisted(() => vi.fn(async () => ({ status: "ok" })));
const runAuthList = vi.hoisted(() => vi.fn(async () => {}));
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./index.js", () => ({ runAuthSet, runAuthUnset, runAuthCheck, runAuthList }));
vi.mock("../../ui/index.js", () => ({
	promptForPositionals: async (_entry: unknown, argv: Record<string, unknown>) => [argv["provider"]],
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	getEntry: (name: string) => name,
	launchMenu,
}));

import { runCommand } from "../../testing/run-command.js";
import { authCommand } from "./auth.command.js";
import { authCheckCommand } from "./auth-check.command.js";
import { authListCommand } from "./auth-list.command.js";
import { authSetCommand } from "./auth-set.command.js";
import { authUnsetCommand } from "./auth-unset.command.js";

beforeEach(() => vi.clearAllMocks());
afterEach(() => void (process.exitCode = undefined));

describe("auth commands", () => {
	it("`auth set` stores a token for the provider, with the positional value and the org", async () => {
		await runCommand(authCommand, ["auth", "set", "github", "tok", "--org", "acme"]);
		expect(runAuthSet).toHaveBeenCalledWith({ provider: "github", positional: "tok", org: "acme" });
		runAuthSet.mockClear();
		await runCommand(authCommand, ["auth", "set", "github"]);
		expect(runAuthSet).toHaveBeenCalledWith({ provider: "github" });
	});

	it("`auth set` exits 1 when storing failed", async () => {
		runAuthSet.mockResolvedValueOnce({ status: "fail" });
		await runCommand(authCommand, ["auth", "set", "github"]);
		expect(process.exitCode).toBe(1);
	});

	it("`auth unset` removes the provider's token", async () => {
		await runCommand(authCommand, ["auth", "unset", "github"]);
		expect(runAuthUnset).toHaveBeenCalledWith({ provider: "github" });
	});

	it("`auth check` re-verifies, passing the org, and exits 1 on failure", async () => {
		await runCommand(authCommand, ["auth", "check", "github", "--org", "acme"]);
		expect(runAuthCheck).toHaveBeenCalledWith({ provider: "github", org: "acme" });
		runAuthCheck.mockResolvedValueOnce({ status: "fail" });
		await runCommand(authCommand, ["auth", "check", "github"]);
		expect(runAuthCheck).toHaveBeenLastCalledWith({ provider: "github" });
		expect(process.exitCode).toBe(1);
	});

	it("`auth list` lists the stored tokens", async () => {
		await runCommand(authCommand, ["auth", "list"]);
		expect(runAuthList).toHaveBeenCalled();
	});

	it("a bare `auth` opens the menu of its subcommands", async () => {
		await runCommand(authCommand, ["auth"]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"auth — choose a subcommand:",
			expect.any(String),
			["auth"]
		);
	});

	it("names each subcommand the way it is typed", () => {
		expect([authSetCommand, authUnsetCommand, authCheckCommand, authListCommand].map((c) => c.command)).toEqual([
			"set [provider] [value]",
			"unset [provider]",
			"check [provider]",
			"list",
		]);
	});
});
