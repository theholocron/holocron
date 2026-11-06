import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runProjectReconcile = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../../config/index.js", () => ({ loadConfig }));
vi.mock("./index.js", () => ({ runProjectReconcile }));
vi.mock("../../token-context/index.js", () => ({ tokenContext }));
vi.mock("../../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { projectReconcileCommand } from "./reconcile.command.js";

const run = (argv: object = {}) =>
	(projectReconcileCommand.handler as (a: never) => Promise<void>)({ cwd: "/repo", dryRun: false, ...argv } as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runProjectReconcile.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("project reconcile command", () => {
	it("reconciles every declared board with the dry-run flag and the resolved org", async () => {
		await run({ dryRun: true });
		expect(runProjectReconcile.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", dryRun: true, org: "acme" },
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("passes the board it is given", async () => {
		await run({ board: "v5" });
		expect(runProjectReconcile.mock.calls[0]![0]).toMatchObject({ board: "v5" });
	});

	it("exits 1 on a failure, but not on a dry run", async () => {
		runProjectReconcile.mockResolvedValue({ status: "dry-run" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runProjectReconcile.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runProjectReconcile).not.toHaveBeenCalled();
	});

	it("is `reconcile [board]`", () => {
		expect(projectReconcileCommand.command).toBe("reconcile [board]");
	});
});
