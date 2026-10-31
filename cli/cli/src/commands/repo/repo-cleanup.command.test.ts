import { describe, expect, it, vi } from "vitest";

const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
const runCleanupBranches = vi.hoisted(() => vi.fn(async () => ({ status: "ok" })));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));
vi.mock("../repo-cleanup-branches/index.js", () => ({ runCleanupBranches }));
vi.mock("../../config/index.js", () => ({ loadConfig: vi.fn(async () => ({ resolved: {}, filepath: "/x" })) }));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext: () => ({ cliToken: "t" }),
	applyResolvedConfig: vi.fn(),
	resolveOrg: () => "acme",
}));

import { runCommand } from "../../testing/run-command.js";
import { repoCleanupCommand } from "./repo-cleanup.command.js";

describe("repo cleanup", () => {
	it("nests `branches` under it", async () => {
		await runCommand(repoCleanupCommand, ["cleanup", "branches", "--dry-run"]);
		expect(runCleanupBranches).toHaveBeenCalledTimes(1);
	});

	it("opens the menu at the group when it is bare", async () => {
		runCleanupBranches.mockClear();
		await runCommand(repoCleanupCommand, ["cleanup"]);
		expect(runCleanupBranches).not.toHaveBeenCalled();
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			"repo cleanup — choose a subcommand:",
			expect.any(String),
			["repo", "cleanup"]
		);
	});
});
