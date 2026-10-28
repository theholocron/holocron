import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runClone = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
const openPath = vi.hoisted(() => vi.fn());
const resolveToken = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock("./index.js", async (importActual) => ({
	...(await importActual<typeof import("./index.js")>()),
	runClone,
}));
vi.mock("@inquirer/prompts", () => ({ confirm }));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	openPath,
	promptForPositionals: async (_entry: unknown, argv: Record<string, unknown>) => [argv["target"]],
}));
vi.mock("../../auth/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../auth/index.js")>()),
	createFeatureResolver: () => resolveToken,
}));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
}));

import { AuthError } from "../../auth/index.js";
import { DRY_RUN_NOOP_EXIT_CODE, DRY_RUN_PREVIEW_ENV_VAR } from "../../interactive-menu/index.js";
import { runCommand } from "../../testing/run-command.js";
import { NonInteractiveError } from "../../ui/index.js";
import { cloneCommand } from "./clone.command.js";

const stdin = (v: boolean | undefined) =>
	Object.defineProperty(process.stdin, "isTTY", { value: v, configurable: true });

beforeEach(() => {
	vi.clearAllMocks();
	tokenContext.mockReturnValue({ cliToken: "t" });
	resolveToken.mockReturnValue("read-token");
	runClone.mockResolvedValue({ status: "ok", cloned: 1 });
	stdin(true);
});
afterEach(() => {
	process.exitCode = undefined;
	stdin(undefined);
	vi.unstubAllEnvs();
});

describe("clone command", () => {
	it("clones one repo with the read token, into --dir, honouring --dry-run", async () => {
		await runCommand(cloneCommand, ["clone", "acme/widgets", "--dir", "/code", "--dry-run"]);
		expect(resolveToken).toHaveBeenCalledWith({ cliToken: "t" });
		const input = runClone.mock.calls[0]![0];
		expect(input).toMatchObject({ org: "acme", repo: "widgets", token: "read-token", dryRun: true, dir: "/code" });
		expect("confirmWholeOrg" in input).toBe(false);
	});

	it("prefers a github token given by name", async () => {
		tokenContext.mockReturnValue({ cliToken: "bare", cliTokens: { github: "named" } });
		await runCommand(cloneCommand, ["clone", "acme/widgets"]);
		expect(resolveToken).toHaveBeenCalledWith({ cliToken: "named" });
	});

	it("says why it cannot clone when there is no token, whatever kind of error it was", async () => {
		resolveToken.mockImplementationOnce(() => {
			throw new AuthError("no GitHub token");
		});
		await runCommand(cloneCommand, ["clone", "acme/widgets"]);
		expect(reportError).toHaveBeenCalledWith("clone: no GitHub token");
		expect(process.exitCode).toBe(1);
		resolveToken.mockImplementationOnce(() => {
			throw "odd";
		});
		await runCommand(cloneCommand, ["clone", "acme/widgets"]);
		expect(reportError).toHaveBeenLastCalledWith("clone: odd");
		expect(runClone).not.toHaveBeenCalled();
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await runCommand(cloneCommand, ["clone", "acme/widgets"]);
		expect(runClone).not.toHaveBeenCalled();
	});

	it("asks before cloning a whole org, and says it needs a terminal otherwise", async () => {
		await runCommand(cloneCommand, ["clone", "acme"]);
		const { confirmWholeOrg } = runClone.mock.calls[0]![0];
		confirm.mockResolvedValue(true);
		await expect(confirmWholeOrg({ total: 10, alreadyCloned: 4, toClone: 6 })).resolves.toBe(true);
		expect(confirm.mock.calls[0]![0].message).toContain("acme has 10 repos — 4 already cloned locally, 6 new");
		confirm.mockClear();
		await expect(confirmWholeOrg({ total: 3, alreadyCloned: 3, toClone: 0 })).resolves.toBe(true);
		expect(confirm).not.toHaveBeenCalled();
		stdin(false);
		await expect(confirmWholeOrg({ total: 1, alreadyCloned: 0, toClone: 1 })).rejects.toBeInstanceOf(
			NonInteractiveError
		);
	});

	it("offers to open the clone on a terminal, but not when the menu is about to ask to proceed", async () => {
		await runCommand(cloneCommand, ["clone", "acme/widgets"]);
		const { confirmOpen } = runClone.mock.calls[0]![0];
		confirm.mockResolvedValueOnce(true);
		await confirmOpen("/code/acme/widgets", false);
		expect(openPath).toHaveBeenCalledWith("/code/acme/widgets");
		openPath.mockClear();
		confirm.mockResolvedValueOnce(false);
		await confirmOpen("/code/acme/widgets", false);
		expect(openPath).not.toHaveBeenCalled();
		vi.stubEnv(DRY_RUN_PREVIEW_ENV_VAR, "1");
		confirm.mockClear();
		await confirmOpen("/code/acme/widgets", true);
		expect(confirm).not.toHaveBeenCalled();
		stdin(false);
		await confirmOpen("/code/acme/widgets", false);
		expect(confirm).not.toHaveBeenCalled();
	});

	it("exits 1 and says why when the clone failed", async () => {
		runClone.mockResolvedValue({ status: "fail", message: "disk full" });
		await runCommand(cloneCommand, ["clone", "acme/widgets"]);
		expect(reportError).toHaveBeenCalledWith("clone: disk full");
		expect(process.exitCode).toBe(1);
		reportError.mockClear();
		runClone.mockResolvedValue({ status: "fail" });
		await runCommand(cloneCommand, ["clone", "acme/widgets"]);
		expect(reportError).not.toHaveBeenCalled();
	});

	it("reports 'nothing to do' to the menu only for a preview that would clone nothing", async () => {
		runClone.mockResolvedValue({ status: "dry-run", cloned: 0 });
		await runCommand(cloneCommand, ["clone", "acme/widgets", "--dry-run"]);
		expect(process.exitCode).toBeUndefined();
		vi.stubEnv(DRY_RUN_PREVIEW_ENV_VAR, "1");
		await runCommand(cloneCommand, ["clone", "acme/widgets", "--dry-run"]);
		expect(process.exitCode).toBe(DRY_RUN_NOOP_EXIT_CODE);
	});
});
