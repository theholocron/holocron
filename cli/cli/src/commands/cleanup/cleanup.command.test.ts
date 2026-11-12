import { describe, expect, it, vi } from "vitest";

const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
const runCleanupBranches = vi.hoisted(() => vi.fn(async () => ({ status: "ok" })));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));
vi.mock("../repo-cleanup-branches/index.js", () => ({ runCleanupBranches }));
vi.mock("../../config/index.js", () => ({ loadConfig: vi.fn(async () => ({ resolved: {}, filepath: "/x" })) }));
vi.mock("../token-context/index.js", () => ({
	tokenContext: () => ({ cliToken: "t" }),
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: () => "acme",
}));

import { runCommand } from "../run-command.testing.js";
import { cleanupCommand } from "./cleanup.command.js";

describe("cleanup", () => {
	it("nests `branches` under it", async () => {
		await runCommand(cleanupCommand, ["cleanup", "branches", "--dry-run"]);
		expect(runCleanupBranches).toHaveBeenCalledTimes(1);
	});

	it("opens the menu at the group when it is bare", async () => {
		runCleanupBranches.mockClear();
		await runCommand(cleanupCommand, ["cleanup"]);
		expect(runCleanupBranches).not.toHaveBeenCalled();
		expect(launchMenu).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({
				pickMessage: "cleanup — choose a subcommand:",
				startPath: ["cleanup"],
			})
		);
	});
});
