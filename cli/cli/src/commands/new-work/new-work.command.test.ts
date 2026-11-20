import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runNewWork = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-new-work/run-new-work.js", () => ({ runNewWork }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { newCommand } from "../new/new.command.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(newCommand, ["new", "work", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runNewWork.mockResolvedValue({ status: "ok", rows: [], key: "#1" });
});
afterEach(() => void (process.exitCode = undefined));

describe("new work", () => {
	it("passes the title, the issue fields, --yes and the context", async () => {
		await go(
			"Fix it",
			"--effort",
			"low",
			"--area",
			"cli",
			"--label",
			"bug",
			"--assignee",
			"octo",
			"--milestone",
			"v4.0",
			"--yes"
		);
		expect(runNewWork).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Fix it",
				effort: "low",
				areas: ["cli"],
				labels: ["bug"],
				assignees: ["octo"],
				milestone: "v4.0",
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves out what was not given, and passes dry-run", async () => {
		await go("Fix it", "--dry-run");
		const input = runNewWork.mock.calls[0]![0];
		for (const key of ["body", "assignees", "labels", "milestone", "spec", "specName", "effort", "yes"])
			expect(input).not.toHaveProperty(key);
		expect(input.context.dryRun).toBe(true);
	});

	it("takes --spec bare, or with a name", async () => {
		await go("Fix it", "--spec");
		expect(runNewWork.mock.calls[0]![0]).toMatchObject({ spec: true });
		expect(runNewWork.mock.calls[0]![0]).not.toHaveProperty("specName");
		await go("Fix it", "--spec", "tech-x");
		expect(runNewWork.mock.calls[1]![0]).toMatchObject({ spec: true, specName: "tech-x" });
	});

	it("reads --body-file, and reports one it cannot read", async () => {
		const dir = mkdtempSync(join(tmpdir(), "work-"));
		writeFileSync(join(dir, "b.md"), "from file");
		await go("Fix it", "--body-file", join(dir, "b.md"));
		expect(runNewWork).toHaveBeenCalledWith(expect.objectContaining({ body: "from file" }));
		const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
		await go("Fix it", "--body-file", join(dir, "missing.md"));
		expect(err).toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});

	it("sets a failing exit code and does nothing without a token", async () => {
		runNewWork.mockResolvedValue({ status: "fail", rows: [] });
		await go("Fix it");
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		tokenContext.mockReturnValue(undefined);
		runNewWork.mockClear();
		await go("Fix it");
		expect(runNewWork).not.toHaveBeenCalled();
	});
});
