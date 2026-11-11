import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runPropertiesApply = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("../repo-properties/run-properties-apply/run-properties-apply.js", () => ({ runPropertiesApply }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { applyCommand } from "./apply.command.js";

const go = (...args: string[]) => runCommand(applyCommand, ["apply", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runPropertiesApply.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("apply properties", () => {
	it("passes the context and --yes", async () => {
		await go("properties", "--yes");
		expect(runPropertiesApply).toHaveBeenCalledWith(
			expect.objectContaining({
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" }),
			})
		);
	});

	it("asks by default, does nothing without tokens, and sets a failing exit code", async () => {
		await go("properties");
		expect(runPropertiesApply).toHaveBeenLastCalledWith(expect.not.objectContaining({ yes: true }));
		tokenContext.mockReturnValueOnce(undefined);
		await go("properties");
		expect(runPropertiesApply).toHaveBeenCalledTimes(1);
		runPropertiesApply.mockResolvedValueOnce({ status: "fail" });
		await go("properties");
		expect(process.exitCode).toBe(1);
	});
});
