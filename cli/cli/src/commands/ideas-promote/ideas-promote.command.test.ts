import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runIdeasPromote = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-ideas-promote/run-ideas-promote.js", () => ({ runIdeasPromote }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { ideasCommand } from "../ideas/index.js";
import { runCommand } from "../run-command.testing.js";

const go = (...args: string[]) => runCommand(ideasCommand, ["ideas", "promote", ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runIdeasPromote.mockResolvedValue({ status: "ok", rows: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("ideas promote", () => {
	it("passes the issue as text, the name, --yes and the context", async () => {
		await go("2017", "--name", "tech-x", "--yes");
		expect(runIdeasPromote).toHaveBeenCalledWith(
			expect.objectContaining({
				issue: "2017",
				name: "tech-x",
				yes: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves name and yes out, and passes dry-run", async () => {
		await go("#5", "--dry-run");
		const input = runIdeasPromote.mock.calls[0]![0];
		expect(input.issue).toBe("#5");
		expect(input).not.toHaveProperty("yes");
		expect(input).not.toHaveProperty("name");
		expect(input.context.dryRun).toBe(true);
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go("1");
		expect(runIdeasPromote).not.toHaveBeenCalled();
		runIdeasPromote.mockResolvedValueOnce({ status: "fail", rows: [] });
		await go("1");
		expect(process.exitCode).toBe(1);
	});
});
