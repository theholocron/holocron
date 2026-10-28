import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runNpmBumpVersions = vi.hoisted(() => vi.fn());
const runPublish = vi.hoisted(() => vi.fn());
const runSteadyPublish = vi.hoisted(() => vi.fn());
const runSyncTrust = vi.hoisted(() => vi.fn());
const resolveOtp = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../npm-bump-versions/index.js", () => ({ runNpmBumpVersions }));
vi.mock("../publish/index.js", () => ({ runPublish, runSteadyPublish, runSyncTrust, resolveOtp }));
vi.mock("./index.js", () => ({ runPublish, runSteadyPublish, runSyncTrust, resolveOtp }));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_e: unknown, argv: Record<string, unknown>) => [argv["new-version"]],
}));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
}));

import { DRY_RUN_NOOP_EXIT_CODE, DRY_RUN_PREVIEW_ENV_VAR } from "../../interactive-menu/index.js";
import { runCommand } from "../../testing/run-command.js";
import { packageCommand } from "./package.command.js";

const go = (args: string[]) => runCommand(packageCommand, args);

beforeEach(() => {
	vi.clearAllMocks();
	resolveOtp.mockReturnValue(undefined);
	runNpmBumpVersions.mockResolvedValue({ status: "ok" });
	runPublish.mockResolvedValue({ status: "ok", packageNames: ["a"] });
	runSteadyPublish.mockResolvedValue({ status: "ok" });
	runSyncTrust.mockResolvedValue({ status: "ok" });
});
afterEach(() => {
	process.exitCode = undefined;
	vi.unstubAllEnvs();
});

describe("package bump-versions", () => {
	it("bumps every package to the version, and exits 1 on failure", async () => {
		await go(["package", "bump-versions", "2.0.0", "--dry-run"]);
		expect(runNpmBumpVersions).toHaveBeenCalledWith({ version: "2.0.0", cwd: "/repo", dryRun: true });
		runNpmBumpVersions.mockResolvedValue({ status: "fail" });
		await go(["package", "bump-versions", "2.0.0"]);
		expect(process.exitCode).toBe(1);
	});
});

describe("package publish", () => {
	it("publishes in steady state with provenance by default, passing the tag and OTP", async () => {
		resolveOtp.mockReturnValue("123456");
		await go(["package", "publish", "--tag", "next", "--otp", "123456", "--skip-already-published"]);
		expect(runSteadyPublish).toHaveBeenCalledWith({
			cwd: "/repo",
			dryRun: false,
			provenance: true,
			skipAlreadyPublished: true,
			tag: "next",
			otp: "123456",
		});
	});

	it("leaves out the tag and OTP it was not given, and exits 1 when publishing failed", async () => {
		runSteadyPublish.mockResolvedValue({ status: "fail" });
		await go(["package", "publish"]);
		const options = runSteadyPublish.mock.calls[0]![0];
		expect("tag" in options || "otp" in options).toBe(false);
		expect(process.exitCode).toBe(1);
	});

	it("does the one-shot bootstrap publish with --initial", async () => {
		resolveOtp.mockReturnValue("1");
		await go(["package", "publish", "--initial", "--tag", "alpha", "--otp", "1"]);
		expect(runPublish).toHaveBeenCalledWith({ cwd: "/repo", dryRun: false, tag: "alpha", otp: "1" });
		expect(runSteadyPublish).not.toHaveBeenCalled();
		resolveOtp.mockReturnValue(undefined);
		await go(["package", "publish", "--initial"]);
		expect(runPublish).toHaveBeenLastCalledWith({ cwd: "/repo", dryRun: false });
	});

	it("exits 1 when the bootstrap publish failed, and says 'nothing to do' to the menu only for a preview with no packages", async () => {
		runPublish.mockResolvedValue({ status: "fail", packageNames: [] });
		await go(["package", "publish", "--initial"]);
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		runPublish.mockResolvedValue({ status: "ok", packageNames: [] });
		await go(["package", "publish", "--initial"]);
		expect(process.exitCode).toBeUndefined();
		vi.stubEnv(DRY_RUN_PREVIEW_ENV_VAR, "1");
		await go(["package", "publish", "--initial"]);
		expect(process.exitCode).toBe(DRY_RUN_NOOP_EXIT_CODE);
	});

	it("migrates the trusted-publisher config with --sync-trust <old> <new>, for the repo if named", async () => {
		await go(["package", "publish", "--sync-trust", "old.yml", "new.yml", "--repo", "acme/widgets"]);
		expect(runSyncTrust).toHaveBeenCalledWith({
			cwd: "/repo",
			oldFile: "old.yml",
			newFile: "new.yml",
			dryRun: false,
			repo: "acme/widgets",
		});
		await go(["package", "publish", "--sync-trust", "old.yml", "new.yml"]);
		expect("repo" in runSyncTrust.mock.calls[1]![0]).toBe(false);
	});

	it("needs exactly two files for --sync-trust, and exits 1 when it failed", async () => {
		await go(["package", "publish", "--sync-trust", "only-one.yml"]);
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining("requires exactly two values"));
		expect(runSyncTrust).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
		process.exitCode = undefined;
		runSyncTrust.mockResolvedValue({ status: "fail" });
		await go(["package", "publish", "--sync-trust", "a.yml", "b.yml"]);
		expect(process.exitCode).toBe(1);
	});
});

describe("package", () => {
	it("a bare `package` opens the menu of its subcommands", async () => {
		await go(["package"]);
		expect(launchMenu).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			"package — choose a subcommand:",
			expect.any(String),
			["package"]
		);
	});
});
