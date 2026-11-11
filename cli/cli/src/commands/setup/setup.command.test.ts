import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runSetup = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./index.js", () => ({ runSetup }));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../run-command.testing.js";
import { setupCommand } from "./setup.command.js";

const go = (args: string[]) => runCommand(setupCommand, ["setup", ...args]);
const summary = (fail: number) => ({ summary: { ok: 1, fail, skip: 0 } });

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runSetup.mockResolvedValue(summary(0));
});
afterEach(() => void (process.exitCode = undefined));

describe("setup", () => {
	it("applies setup with the tokens, the org and --repo, and --hooks when given", async () => {
		await go(["--repo", "acme/widgets", "--no-hooks"]);
		expect(runSetup.mock.calls[0]![0]).toMatchObject({
			hooks: false,
			context: { repoRoot: "/repo", repo: "acme/widgets", cliToken: "t", org: "acme" },
		});
		await go([]);
		const bare = runSetup.mock.calls[1]![0];
		expect("hooks" in bare || "repo" in bare.context).toBe(false);
	});

	it("exits 1 when a step failed, and stops when --token cannot be parsed", async () => {
		runSetup.mockResolvedValue(summary(2));
		await go([]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runSetup.mockClear();
		await go([]);
		expect(runSetup).not.toHaveBeenCalled();
	});
});
