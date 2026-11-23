import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runReconcileCi = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-reconcile-ci/index.js", () => ({ runReconcileCi }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { reconcileCommand } from "../reconcile/reconcile.command.js";
import { runCommand } from "../run-command.testing.js";
import { reconcileCiEntry } from "./reconcile-ci.entry.js";

const go = (...args: string[]) => runCommand(reconcileCommand, ["reconcile", "ci", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runReconcileCi.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("reconcile ci", () => {
	it("passes the context and nothing that was not given", async () => {
		await go("--dry-run");
		const input = runReconcileCi.mock.calls[0]![0];
		expect(input).toMatchObject({
			context: expect.objectContaining({ repoRoot: "/repo", dryRun: true, cliToken: "t", org: "acme" }),
		});
		expect(input).not.toHaveProperty("pullRequest");
		expect(input).not.toHaveProperty("maxAgeMinutes");
	});

	it("passes the pull request and --max-age", async () => {
		await go("42", "--max-age", "5");
		expect(runReconcileCi.mock.calls[0]![0]).toMatchObject({ pullRequest: 42, maxAgeMinutes: 5 });
	});

	it("exits non-zero when the run fails", async () => {
		runReconcileCi.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go();
		expect(process.exitCode).toBe(1);
	});

	it("does nothing when the token flags are unusable", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go();
		expect(runReconcileCi).not.toHaveBeenCalled();
	});

	it("is in the interactive menu with its dry run", () => {
		expect(reconcileCiEntry).toMatchObject({ name: "reconcile ci", supportsDryRun: true });
	});
});
