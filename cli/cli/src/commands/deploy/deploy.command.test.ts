import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const runDeploy = vi.hoisted(() => vi.fn());
const runDeployFromFiles = vi.hoisted(() => vi.fn());
const runCleanupPreview = vi.hoisted(() => vi.fn());
const deployOnRelease = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./index.js", () => ({ runDeploy, runDeployFromFiles }));
vi.mock("../cleanup-preview/index.js", () => ({ runCleanupPreview }));
vi.mock("@theholocron/astromech", () => ({ deployOnRelease }));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["branch"] ?? argv["pr"]],
}));
vi.mock("../../cli-support/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../cli-support/index.js")>()),
	tokenContext,
	applyResolvedConfig: vi.fn(),
	resolveOrg: (_a: unknown, c: { org?: string }) => c.org,
}));

import { runCommand } from "../../testing/run-command.js";
import { deployCommand } from "./deploy.command.js";

const go = (args: string[]) => runCommand(deployCommand, args);

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runDeploy.mockResolvedValue({ status: "ok" });
	runDeployFromFiles.mockResolvedValue({ status: "ok" });
	runCleanupPreview.mockResolvedValue({ status: "ok" });
	deployOnRelease.mockResolvedValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("deploy", () => {
	it("deploys the branch to the project, to the target if one was named", async () => {
		await go(["deploy", "main", "--project-id", "p1", "--target", "staging"]);
		expect(runDeploy.mock.calls[0]![0]).toMatchObject({
			projectId: "p1",
			branch: "main",
			target: "staging",
			context: { repoRoot: "/repo", cliToken: "t", org: "acme" },
		});
		await go(["deploy", "main", "--project-id", "p1"]);
		expect("target" in runDeploy.mock.calls[1]![0]).toBe(false);
	});

	it("deploys from a directory of files instead, with the target if named", async () => {
		await go(["deploy", "--project-id", "p1", "--files", "/dist", "--target", "production"]);
		expect(runDeploy).not.toHaveBeenCalled();
		expect(runDeployFromFiles.mock.calls[0]![0]).toMatchObject({
			projectId: "p1",
			dir: "/dist",
			target: "production",
		});
		await go(["deploy", "--project-id", "p1", "--files", "/dist"]);
		expect("target" in runDeployFromFiles.mock.calls[1]![0]).toBe(false);
	});

	it("exits 1 when a deploy failed, from a branch or from files", async () => {
		runDeploy.mockResolvedValue({ status: "fail" });
		await go(["deploy", "main", "--project-id", "p1"]);
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		runDeployFromFiles.mockResolvedValue({ status: "fail" });
		await go(["deploy", "--project-id", "p1", "--files", "/dist"]);
		expect(process.exitCode).toBe(1);
	});

	it("says --project-id is missing, and stops when --token cannot be parsed", async () => {
		await go(["deploy", "main"]);
		expect(reportError).toHaveBeenCalledWith("deploy: missing required argument --project-id");
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		tokenContext.mockReturnValue(null);
		await go(["deploy", "main", "--project-id", "p1"]);
		expect(runDeploy).not.toHaveBeenCalled();
	});
});

describe("deploy cleanup-preview", () => {
	it("cleans up the previews of a PR in the project, for the repo if one was named", async () => {
		await go(["deploy", "cleanup-preview", "42", "--project", "web", "--repo", "acme/widgets"]);
		expect(runCleanupPreview.mock.calls[0]![0]).toMatchObject({
			prNumber: 42,
			project: "web",
			repo: "acme/widgets",
		});
		await go(["deploy", "cleanup-preview", "42", "--project", "web"]);
		expect("repo" in runCleanupPreview.mock.calls[1]![0]).toBe(false);
	});

	it("exits 1 when the cleanup failed, and stops when --token cannot be parsed", async () => {
		runCleanupPreview.mockResolvedValue({ status: "fail" });
		await go(["deploy", "cleanup-preview", "42", "--project", "web"]);
		expect(process.exitCode).toBe(1);
		tokenContext.mockReturnValue(null);
		runCleanupPreview.mockClear();
		await go(["deploy", "cleanup-preview", "42", "--project", "web"]);
		expect(runCleanupPreview).not.toHaveBeenCalled();
	});
});

describe("deploy on-release", () => {
	it("deploys what the release changed, for the channel and the range if given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		deployOnRelease.mockImplementation(async (o: { print: (l: string) => void }) => {
			o.print("deployed");
			return { status: "ok" };
		});
		await go(["deploy", "on-release", "--channel", "latest", "--from", "v1", "--to", "v2"]);
		expect(deployOnRelease).toHaveBeenCalledWith(
			expect.objectContaining({ cwd: "/repo", channel: "latest", from: "v1", to: "v2", dryRun: false })
		);
		expect(log).toHaveBeenCalledWith("deployed");
		log.mockRestore();
	});

	it("treats an empty --from or --to as not given, and exits 1 when it failed", async () => {
		deployOnRelease.mockResolvedValue({ status: "fail" });
		await go(["deploy", "on-release", "--channel", "latest", "--from", "", "--to", ""]);
		const options = deployOnRelease.mock.calls[0]![0];
		expect("from" in options || "to" in options).toBe(false);
		expect(process.exitCode).toBe(1);
	});
});
