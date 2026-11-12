import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runMonitoringCheck = vi.hoisted(() => vi.fn());
const resolveVercelBypassHeaders = vi.hoisted(() => vi.fn());
const runMonitoringRunResolved = vi.hoisted(() => vi.fn());
const runMonitoringResolveChecks = vi.hoisted(() => vi.fn());
const readFileSync = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("node:fs", async (importActual) => ({ ...(await importActual<typeof import("node:fs")>()), readFileSync }));
vi.mock("../monitoring-check/index.js", () => ({ runMonitoringCheck }));
vi.mock("../monitoring-run-resolved/index.js", () => ({ resolveVercelBypassHeaders, runMonitoringRunResolved }));
vi.mock("../monitoring-resolve-checks/index.js", () => ({ runMonitoringResolveChecks }));
vi.mock("@theholocron/kyber/prompts", async (importActual) => ({
	...(await importActual<typeof import("@theholocron/kyber/prompts")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["url"]],
}));
vi.mock("../token-context/index.js", () => ({
	tokenContext,
}));
vi.mock("../apply-resolved-config/index.js", () => ({
	applyResolvedConfig: vi.fn(),
}));
vi.mock("../resolve-org/index.js", () => ({
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { resolveCommand } from "../resolve/resolve.command.js";
import { runCommand } from "../run-command.testing.js";
import { checkCommand } from "./check.command.js";

const go = (args: string[]) => runCommand(args[0] === "resolve" ? resolveCommand : checkCommand, args);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runMonitoringCheck.mockResolvedValue({ status: "ok" });
	runMonitoringRunResolved.mockResolvedValue({ status: "ok" });
	resolveVercelBypassHeaders.mockResolvedValue({ headers: { "x-bypass": "s" } });
});
afterEach(() => {
	process.exitCode = undefined;
	vi.unstubAllEnvs();
});

describe("check monitor", () => {
	it("checks the url with the tokens, the org and the bypass headers", async () => {
		vi.stubEnv("VERCEL_TOKEN", "vt");
		vi.stubEnv("VERCEL_TEAM_ID", "team");
		vi.stubEnv("VERCEL_PROTECTION_BYPASS_SECRET", "secret");
		await go(["check", "monitor", "https://x.test", "--vercel-project", "web"]);
		expect(resolveVercelBypassHeaders).toHaveBeenCalledWith({
			url: "https://x.test",
			vercelProject: "web",
			vercelToken: "vt",
			vercelTeamId: "team",
			bypassSecret: "secret",
		});
		expect(runMonitoringCheck.mock.calls[0]![0]).toMatchObject({
			url: "https://x.test",
			headers: { "x-bypass": "s" },
			context: { repoRoot: "/repo", cliToken: "t", org: "acme" },
		});
	});

	it("sends no headers and no Vercel details when it has none, and exits 1 when a check failed", async () => {
		for (const k of ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROTECTION_BYPASS_SECRET"]) vi.stubEnv(k, "");
		resolveVercelBypassHeaders.mockResolvedValue({});
		runMonitoringCheck.mockResolvedValue({ status: "fail" });
		await go(["check", "monitor", "https://x.test"]);
		expect(resolveVercelBypassHeaders).toHaveBeenCalledWith({ url: "https://x.test" });
		expect("headers" in runMonitoringCheck.mock.calls[0]![0]).toBe(false);
		expect(process.exitCode).toBe(1);
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await go(["check", "monitor", "https://x.test"]);
		expect(runMonitoringCheck).not.toHaveBeenCalled();
	});
});

describe("resolve checks", () => {
	it("writes the resolved checks to --out", async () => {
		await go(["resolve", "checks", "--out", "/tmp/checks.json"]);
		expect(runMonitoringResolveChecks.mock.calls[0]![0]).toMatchObject({
			outFile: "/tmp/checks.json",
			context: { cliToken: "t", org: "acme" },
		});
	});

	it("stops when --token cannot be parsed", async () => {
		tokenContext.mockReturnValue(null);
		await go(["resolve", "checks", "--out", "/tmp/checks.json"]);
		expect(runMonitoringResolveChecks).not.toHaveBeenCalled();
	});
});

describe("check resolved", () => {
	it("runs the resolved checks from a file against the url, with the Vercel details from the environment", async () => {
		readFileSync.mockReturnValue(JSON.stringify([{ name: "home" }]));
		vi.stubEnv("VERCEL_TOKEN", "vt");
		vi.stubEnv("VERCEL_TEAM_ID", "team");
		vi.stubEnv("VERCEL_PROTECTION_BYPASS_SECRET", "secret");
		await go(["check", "resolved", "https://x.test", "--checks-file", "c.json", "--vercel-project", "web"]);
		expect(runMonitoringRunResolved).toHaveBeenCalledWith({
			checks: [{ name: "home" }],
			url: "https://x.test",
			vercelProject: "web",
			vercelToken: "vt",
			vercelTeamId: "team",
			bypassSecret: "secret",
		});
	});

	it("leaves out what it was not given, and exits 1 when the run failed", async () => {
		readFileSync.mockReturnValue("[]");
		for (const k of ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROTECTION_BYPASS_SECRET"]) vi.stubEnv(k, "");
		runMonitoringRunResolved.mockResolvedValue({ status: "fail" });
		await go(["check", "resolved", "https://x.test", "--checks-file", "c.json"]);
		expect(runMonitoringRunResolved).toHaveBeenCalledWith({ checks: [], url: "https://x.test" });
		expect(process.exitCode).toBe(1);
	});
});

describe("check", () => {
	it("a bare `check` opens the menu of its subcommands", async () => {
		await go(["check"]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			expect.objectContaining({ pickMessage: "check — choose a subcommand:", startPath: ["check"] })
		);
	});
});
