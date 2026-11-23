import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runIssueUpdate = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-issue-update/run-issue-update.js", () => ({ runIssueUpdate }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { updateCommand } from "../update/update.command.js";

const go = (...args: string[]) => runCommand(updateCommand, ["update", "issue", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runIssueUpdate.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("update issue", () => {
	it("passes the key, the plain flags, --yes and the context", async () => {
		await go(
			"#12",
			"--title",
			"New",
			"--body",
			"text",
			"--state",
			"closed",
			"--state-reason",
			"not_planned",
			"--add-label",
			"a",
			"--add-label",
			"b",
			"--remove-label",
			"c",
			"--assignee",
			"me",
			"--milestone",
			"v4.0",
			"--unblock",
			"#7",
			"--yes"
		);
		expect(runIssueUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				key: "#12",
				title: "New",
				body: "text",
				state: "closed",
				stateReason: "not_planned",
				addLabels: ["a", "b"],
				removeLabels: ["c"],
				assignees: ["me"],
				milestone: "v4.0",
				unblock: ["#7"],
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("passes the issue-field flags and turns --clear words into the capability's fields", async () => {
		await go(
			"12",
			"--type",
			"task",
			"--effort",
			"high",
			"--target-date",
			"2026-12-31",
			"--blocked-by",
			"#4",
			"--clear",
			"assignee",
			"--clear",
			"start-date",
			"--clear",
			"type"
		);
		expect(runIssueUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "task",
				effort: "high",
				targetDate: "2026-12-31",
				blockedBy: ["#4"],
				clear: ["assignees", "startDate", "kind"],
			})
		);
	});

	it("leaves out what was not given, and passes dry-run", async () => {
		await go("12", "--dry-run");
		const input = runIssueUpdate.mock.calls[0]![0];
		for (const key of ["title", "body", "state", "stateReason", "addLabels", "assignees", "clear", "kind", "yes"]) {
			expect(input).not.toHaveProperty(key);
		}
		expect(input.context.dryRun).toBe(true);
	});

	it("reads --body-file, and refuses it together with --body", async () => {
		const dir = mkdtempSync(join(tmpdir(), "issue-"));
		writeFileSync(join(dir, "b.md"), "from file");
		await go("12", "--body-file", join(dir, "b.md"));
		expect(runIssueUpdate).toHaveBeenCalledWith(expect.objectContaining({ body: "from file" }));
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		runIssueUpdate.mockClear();
		await go("12", "--body", "a", "--body-file", "b.md").catch(() => undefined);
		expect(runIssueUpdate).not.toHaveBeenCalled();
		process.exitCode = undefined;
		await go("12", "--body-file", "/nonexistent/none.md");
		expect(runIssueUpdate).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		err.mockRestore();
	});

	it("takes a Type the organization declares, as its lower-case kind, and refuses it when it is not declared", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("12", "--type", "Epic");
		expect(runIssueUpdate).not.toHaveBeenCalled();
		expect(err).toHaveBeenCalledWith(expect.stringContaining("Use one of: bug, feature, task"));
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		loadConfig.mockResolvedValue({ resolved: { org: "acme", issueTypes: [{ name: "Epic" }] }, filepath: "/x" });
		await go("12", "--type", "Epic");
		expect(runIssueUpdate).toHaveBeenCalledWith(expect.objectContaining({ kind: "epic" }));
		err.mockRestore();
	});

	it("refuses a state, a clear word or a type it does not know", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("12", "--state", "pending").catch(() => undefined);
		await go("12", "--state", "closed", "--state-reason", "done").catch(() => undefined);
		await go("12", "--clear", "title").catch(() => undefined);
		await go("12", "--type", "epic").catch(() => undefined);
		expect(runIssueUpdate).not.toHaveBeenCalled();
		err.mockRestore();
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go("12");
		expect(runIssueUpdate).not.toHaveBeenCalled();
		runIssueUpdate.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go("12");
		expect(process.exitCode).toBe(1);
	});
});
