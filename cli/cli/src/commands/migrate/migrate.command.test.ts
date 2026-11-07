import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runMigrate = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-migrate/run-migrate.js", () => ({ runMigrate }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { migrateCommand } from "./index.js";

const go = (...args: string[]) => runCommand(migrateCommand, ["migrate", ...args]);
const ENDS = ["--from", "github", "--to", "linear:team=ENG"];

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runMigrate.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("migrate commands", () => {
	it("is a group: its own handler does nothing, the subcommands and the menu do the work", () => {
		expect(migrateCommand.handler({} as never)).toBeUndefined();
	});

	it("issue passes the key, both ends and the context", async () => {
		await go("issue", "#42", ...ENDS, "--yes");
		expect(runMigrate).toHaveBeenCalledWith(
			expect.objectContaining({
				from: "github",
				to: "linear:team=ENG",
				scope: { kind: "issue", key: "#42" },
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("issues takes --all, a source milestone or keys, with open-only and the target milestone", async () => {
		await go("issues", ...ENDS, "--all", "--open-only", "--milestone", "Q3");
		expect(runMigrate).toHaveBeenLastCalledWith(
			expect.objectContaining({
				scope: { kind: "issues", selector: { all: true } },
				openOnly: true,
				milestone: "Q3",
			})
		);
		await go("issues", ...ENDS, "--source-milestone", "v2");
		expect(runMigrate).toHaveBeenLastCalledWith(
			expect.objectContaining({ scope: { kind: "issues", selector: { milestone: "v2" } } })
		);
		await go("issues", ...ENDS, "--keys", "#1, #2,");
		expect(runMigrate).toHaveBeenLastCalledWith(
			expect.objectContaining({ scope: { kind: "issues", selector: { keys: ["#1", "#2"] } } })
		);
	});

	it("issues needs exactly one way to choose", async () => {
		await expect(go("issues", ...ENDS)).rejects.toThrow(/exactly one of/);
		await expect(go("issues", ...ENDS, "--all", "--keys", "#1")).rejects.toThrow(/exactly one of/);
	});

	it("project passes the board name and the owner", async () => {
		await go("project", "v5", ...ENDS);
		expect(runMigrate).toHaveBeenCalledWith(
			expect.objectContaining({ scope: { kind: "project", name: "v5", owner: "acme" } })
		);
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go("issue", "#1", ...ENDS);
		expect(runMigrate).not.toHaveBeenCalled();
		runMigrate.mockResolvedValueOnce({ status: "fail" });
		await go("issue", "#1", ...ENDS);
		expect(process.exitCode).toBe(1);
	});

	it("uses an empty owner when no organization is known", async () => {
		loadConfig.mockResolvedValue({ resolved: {}, filepath: "/x" });
		await go("project", "v5", ...ENDS);
		expect(runMigrate).toHaveBeenCalledWith(
			expect.objectContaining({ scope: { kind: "project", name: "v5", owner: "" } })
		);
	});
});
