import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runIssueCreate = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-issue-create/run-issue-create.js", () => ({ runIssueCreate }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { newCommand } from "../new/new.command.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(newCommand, ["new", "issue", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runIssueCreate.mockResolvedValue({ status: "ok", rows: [], key: "#1" });
});
afterEach(() => void (process.exitCode = undefined));

describe("new issue", () => {
	it("passes the title, body, repeated labels, milestone, --yes and the context", async () => {
		await go("Fix it", "--body", "text", "--label", "bug", "--label", "cli", "--milestone", "v4.0", "--yes");
		expect(runIssueCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Fix it",
				body: "text",
				labels: ["bug", "cli"],
				milestone: "v4.0",
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves out what was not given, and passes dry-run", async () => {
		await go("Fix it", "--dry-run");
		const input = runIssueCreate.mock.calls[0]![0];
		for (const key of ["body", "labels", "milestone", "yes"]) expect(input).not.toHaveProperty(key);
		expect(input.context.dryRun).toBe(true);
	});

	it("keeps a numeric-looking title as text", async () => {
		await go("2017");
		expect(runIssueCreate.mock.calls[0]![0].title).toBe("2017");
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go("x");
		expect(runIssueCreate).not.toHaveBeenCalled();
		runIssueCreate.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go("x");
		expect(process.exitCode).toBe(1);
	});
});
