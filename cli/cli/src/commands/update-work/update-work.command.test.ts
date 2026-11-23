import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runUpdateWork = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-update-work/run-update-work.js", () => ({ runUpdateWork }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { updateCommand } from "../update/update.command.js";

const go = (...args: string[]) => runCommand(updateCommand, ["update", "work", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runUpdateWork.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("update work", () => {
	it("passes the issue, the flags, --yes and the context", async () => {
		await go(
			"#12",
			"--title",
			"fix: it",
			"--issue-title",
			"It",
			"--label",
			"a",
			"--remove-label",
			"b",
			"--assignee",
			"octo",
			"--milestone",
			"v5",
			"--unblock",
			"#3",
			"--pr",
			"7",
			"--start",
			"--name",
			"it",
			"--base",
			"alpha",
			"--spec",
			".notes/x.spec.md",
			"--one-pr",
			"--status",
			"In Progress",
			"--force",
			"--board",
			"Roadmap",
			"--effort",
			"low",
			"--area",
			"cli",
			"--yes"
		);
		expect(runUpdateWork).toHaveBeenCalledWith(
			expect.objectContaining({
				issue: "#12",
				title: "fix: it",
				issueTitle: "It",
				addLabels: ["a"],
				removeLabels: ["b"],
				assignees: ["octo"],
				milestone: "v5",
				unblock: ["#3"],
				pullRequest: 7,
				start: true,
				name: "it",
				base: "alpha",
				spec: ".notes/x.spec.md",
				onePr: true,
				status: "In Progress",
				force: true,
				board: "Roadmap",
				effort: "low",
				areas: ["cli"],
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves out what was not given, and passes dry-run", async () => {
		await go("#12", "--dry-run");
		const input = runUpdateWork.mock.calls[0]![0];
		for (const key of ["title", "addLabels", "pullRequest", "start", "status", "force", "yes", "milestone"])
			expect(input).not.toHaveProperty(key);
		expect(input.context.dryRun).toBe(true);
	});

	it("sets a failing exit code when the run failed", async () => {
		runUpdateWork.mockResolvedValue({ status: "fail", rows: [] });
		await go("#12");
		expect(process.exitCode).toBe(1);
	});

	it("does nothing without a token context", async () => {
		tokenContext.mockReturnValue(undefined);
		await go("#12");
		expect(runUpdateWork).not.toHaveBeenCalled();
	});

	it("refuses a --type the organization does not declare, and takes one it does", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("#12", "--type", "Epic");
		expect(runUpdateWork).not.toHaveBeenCalled();
		expect(err).toHaveBeenCalledWith(expect.stringContaining("Use one of: bug, feature, task"));
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		loadConfig.mockResolvedValue({ resolved: { org: "acme", issueTypes: [{ name: "Epic" }] }, filepath: "/x" });
		await go("#12", "--type", "Epic");
		expect(runUpdateWork).toHaveBeenCalledWith(expect.objectContaining({ kind: "epic" }));
		err.mockRestore();
	});
});
