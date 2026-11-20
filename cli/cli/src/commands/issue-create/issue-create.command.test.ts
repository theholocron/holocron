import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
		for (const key of [
			"body",
			"assignees",
			"labels",
			"milestone",
			"yes",
			"kind",
			"priority",
			"effort",
			"parent",
			"project",
			"areas",
		])
			expect(input).not.toHaveProperty(key);
		expect(input.context.dryRun).toBe(true);
	});

	it("passes repeated assignees and reads --body-file", async () => {
		const dir = mkdtempSync(join(tmpdir(), "issue-"));
		writeFileSync(join(dir, "b.md"), "from file");
		await go("Fix it", "--body-file", join(dir, "b.md"), "--assignee", "me", "--assignee", "octo");
		expect(runIssueCreate).toHaveBeenCalledWith(
			expect.objectContaining({ body: "from file", assignees: ["me", "octo"] })
		);
	});

	it("refuses --body with --body-file, and reports an unreadable file", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("Fix it", "--body", "a", "--body-file", "b.md").catch(() => undefined);
		expect(runIssueCreate).not.toHaveBeenCalled();
		process.exitCode = undefined;
		await go("Fix it", "--body-file", "/nonexistent/none.md");
		expect(runIssueCreate).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		err.mockRestore();
	});

	it("passes the issue-field flags in the capability's words", async () => {
		await go(
			"Fix it",
			"--type",
			"bug",
			"--priority",
			"high",
			"--effort",
			"low",
			"--start-date",
			"2026-12-01",
			"--target-date",
			"2026-12-31",
			"--parent",
			"#3",
			"--blocked-by",
			"#4",
			"--blocked-by",
			"#5",
			"--project",
			"Roadmap",
			"--area",
			"cli"
		);
		expect(runIssueCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "bug",
				priority: "high",
				effort: "low",
				startDate: "2026-12-01",
				targetDate: "2026-12-31",
				parent: "#3",
				blockedBy: ["#4", "#5"],
				project: "Roadmap",
				areas: ["cli"],
			})
		);
	});

	it("refuses a type, priority or effort it does not know", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("Fix it", "--type", "epic").catch(() => undefined);
		await go("Fix it", "--effort", "huge").catch(() => undefined);
		expect(runIssueCreate).not.toHaveBeenCalled();
		err.mockRestore();
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
