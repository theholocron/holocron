import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runProjectMove = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
vi.mock("../../../config/index.js", () => ({ loadConfig }));
vi.mock("./move.js", () => ({ runProjectMove }));
vi.mock("../../../cli-support/index.js", () => ({
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { projectMoveCommand } from "./move.command.js";

const run = (argv: object = {}) =>
	(projectMoveCommand.handler as (a: never) => Promise<void>)({
		cwd: "/repo",
		dryRun: false,
		from: "v4",
		to: "v5",
		...argv,
	} as never);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({});
	runProjectMove.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("project move command", () => {
	it("runs the move with the boards, the dry-run flag and the resolved org", async () => {
		await run({ dryRun: true });
		expect(runProjectMove.mock.calls[0]![0]).toEqual({
			loaded: { resolved: { org: "acme" }, filepath: "/x" },
			context: { repoRoot: "/repo", dryRun: true, org: "acme" },
			from: "v4",
			to: "v5",
		});
		expect(process.exitCode).toBeUndefined();
	});

	it("passes --template and --yes", async () => {
		await run({ template: "sprint", yes: true });
		expect(runProjectMove.mock.calls[0]![0]).toMatchObject({ template: "sprint", yes: true });
	});

	it("exits 1 on a failure, but not on a skip or a cancel", async () => {
		runProjectMove.mockResolvedValue({ status: "skip" });
		await run();
		runProjectMove.mockResolvedValue({ status: "cancelled" });
		await run();
		expect(process.exitCode).toBeUndefined();
		runProjectMove.mockResolvedValue({ status: "fail" });
		await run();
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await run();
		expect(runProjectMove).not.toHaveBeenCalled();
	});

	it("is `move <from> <to>`", () => {
		expect(projectMoveCommand.command).toBe("move <from> <to>");
	});
});
