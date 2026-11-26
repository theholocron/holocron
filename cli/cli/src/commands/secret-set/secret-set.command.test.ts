import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSecretSet = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./index.js", () => ({ runSecretSet }));
vi.mock("@inquirer/prompts", () => ({ confirm }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { secretSetCommand } from "./secret-set.command.js";
import { secretSetEntry } from "./secret-set.entry.js";

const go = (...args: string[]) => runCommand(secretSetCommand, ["secret", ...args]);
const isTTY = process.stdin.isTTY;

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSecretSet.mockResolvedValue({ status: "ok", name: "CRON_SECRET" });
	process.stdin.isTTY = false;
});
afterEach(() => {
	process.exitCode = undefined;
	process.stdin.isTTY = isTTY;
});

describe("new secret", () => {
	it("keeps the github target and gives nothing else when no new flag is used", async () => {
		await go("NPM_TOKEN", "tok");
		const input = runSecretSet.mock.calls[0]![0];
		expect(input).toMatchObject({ name: "NPM_TOKEN", value: "tok", target: "github", scope: { kind: "repo" } });
		for (const key of ["generate", "environment", "yes", "confirm"]) expect(input).not.toHaveProperty(key);
	});

	it("passes --target file, --generate, --env and --yes", async () => {
		await go("CRON_SECRET", "--target", "file", "--generate", "--env", "prod", "--yes");
		expect(runSecretSet.mock.calls[0]![0]).toMatchObject({
			name: "CRON_SECRET",
			target: "file",
			generate: true,
			environment: "prod",
			yes: true,
		});
	});

	it("offers a question only on a terminal, and asks with a default of no", async () => {
		process.stdin.isTTY = true;
		confirm.mockResolvedValue(true);
		await go("CRON_SECRET", "--target", "file", "--generate");
		const input = runSecretSet.mock.calls[0]![0];
		expect(await input.confirm("Write it?")).toBe(true);
		expect(confirm).toHaveBeenCalledWith({ message: "Write it?", default: false });
	});

	it("exits non-zero when the run fails, and does nothing when the token flags are unusable", async () => {
		runSecretSet.mockResolvedValueOnce({ status: "fail", name: "CRON_SECRET" });
		await go("CRON_SECRET");
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValueOnce(undefined);
		runSecretSet.mockClear();
		await go("CRON_SECRET");
		expect(runSecretSet).not.toHaveBeenCalled();
	});

	it("offers the new options in the interactive menu and skips the CI-only ones", () => {
		const keys = (secretSetEntry.options ?? []).map((o) => o.key);
		expect(keys).toEqual(expect.arrayContaining(["scope", "generate", "target", "env"]));
		expect(secretSetEntry.skipOptions).toContain("yes");
	});
});
