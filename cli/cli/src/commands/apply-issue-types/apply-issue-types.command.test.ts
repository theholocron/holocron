import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runIssueTypesApply = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-issue-types-apply/run-issue-types-apply.js", () => ({ runIssueTypesApply }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { applyCommand } from "../apply/apply.command.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(applyCommand, ["apply", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runIssueTypesApply.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("apply issue-types", () => {
	it("passes the context, --update and --yes", async () => {
		await go("issue-types", "--update", "--yes");
		expect(runIssueTypesApply).toHaveBeenCalledWith(
			expect.objectContaining({
				update: true,
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", dryRun: false, cliToken: "t", org: "acme" }),
			})
		);
	});

	it("asks and only creates by default, does nothing without tokens, and sets a failing exit code", async () => {
		await go("issue-types");
		expect(runIssueTypesApply).toHaveBeenLastCalledWith(expect.not.objectContaining({ yes: true, update: true }));
		tokenContext.mockReturnValueOnce(undefined);
		await go("issue-types");
		expect(runIssueTypesApply).toHaveBeenCalledTimes(1);
		runIssueTypesApply.mockResolvedValueOnce({ status: "fail" });
		await go("issue-types");
		expect(process.exitCode).toBe(1);
	});
});
