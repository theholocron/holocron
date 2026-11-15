import { beforeEach, describe, expect, it, vi } from "vitest";

const runPublish = vi.hoisted(() => vi.fn());
const runSteadyPublish = vi.hoisted(() => vi.fn());
const runSyncTrust = vi.hoisted(() => vi.fn());
vi.mock("./index.js", async (importActual) => ({
	...(await importActual<typeof import("./index.js")>()),
	runPublish,
	runSteadyPublish,
	runSyncTrust,
}));

import { runCommand } from "../run-command.testing.js";
import { publishPackageCommand } from "./publish-package.command.js";

beforeEach(() => {
	vi.clearAllMocks();
	process.exitCode = undefined;
	runPublish.mockResolvedValue({ status: "ok", packageNames: ["a"] });
	runSteadyPublish.mockResolvedValue({ status: "ok", packageNames: ["a"] });
	runSyncTrust.mockResolvedValue({ status: "ok" });
});

describe("publish command's --group", () => {
	it("steady-state publishes the whole workspace without it", async () => {
		await runCommand(publishPackageCommand, ["package"]);
		expect("group" in runSteadyPublish.mock.calls[0]![0]).toBe(false);
	});

	it("steady-state publishes one group with it", async () => {
		await runCommand(publishPackageCommand, ["package", "--group", "clients", "--skip-already-published"]);
		expect(runSteadyPublish.mock.calls[0]![0]).toMatchObject({ group: "clients", skipAlreadyPublished: true });
	});

	it("--initial bootstraps only the group's packages, or all without it", async () => {
		await runCommand(publishPackageCommand, ["package", "--initial", "--group", "observability"]);
		expect(runPublish.mock.calls[0]![0]).toMatchObject({ group: "observability" });
		await runCommand(publishPackageCommand, ["package", "--initial"]);
		expect("group" in runPublish.mock.calls[1]![0]).toBe(false);
	});

	it("--sync-trust migrates only the group's packages, or all without it", async () => {
		await runCommand(publishPackageCommand, ["package", "--sync-trust", "old.yml", "new.yml", "--group", "utils"]);
		expect(runSyncTrust.mock.calls[0]![0]).toMatchObject({
			oldFile: "old.yml",
			newFile: "new.yml",
			group: "utils",
		});
		await runCommand(publishPackageCommand, ["package", "--sync-trust", "old.yml", "new.yml"]);
		expect("group" in runSyncTrust.mock.calls[1]![0]).toBe(false);
	});

	it("steady-state publishes everything except the --exclude-group groups", async () => {
		await runCommand(publishPackageCommand, [
			"package",
			"--exclude-group",
			"observability",
			"--exclude-group",
			"skills",
		]);
		const input = runSteadyPublish.mock.calls[0]![0];
		expect(input).toMatchObject({ excludeGroups: ["observability", "skills"] });
		expect("group" in input).toBe(false);
	});

	it("passes the excluded groups to --initial and --sync-trust too", async () => {
		await runCommand(publishPackageCommand, ["package", "--initial", "--exclude-group", "utils"]);
		expect(runPublish.mock.calls[0]![0]).toMatchObject({ excludeGroups: ["utils"] });
		await runCommand(publishPackageCommand, [
			"package",
			"--sync-trust",
			"old.yml",
			"new.yml",
			"--exclude-group",
			"utils",
		]);
		expect(runSyncTrust.mock.calls[0]![0]).toMatchObject({ excludeGroups: ["utils"] });
	});

	it("passes no excluded groups when none are given", async () => {
		await runCommand(publishPackageCommand, ["package"]);
		expect("excludeGroups" in runSteadyPublish.mock.calls[0]![0]).toBe(false);
	});
});

describe("publish command's --package", () => {
	it("limits --initial and --sync-trust to the packages named", async () => {
		await runCommand(publishPackageCommand, [
			"package",
			"--initial",
			"--package",
			"@acme/a",
			"--package",
			"plugins/b",
		]);
		expect(runPublish.mock.calls[0]![0]).toMatchObject({ onlyPackages: ["@acme/a", "plugins/b"] });
		await runCommand(publishPackageCommand, [
			"package",
			"--sync-trust",
			"old.yml",
			"new.yml",
			"--package",
			"@acme/a",
		]);
		expect(runSyncTrust.mock.calls[0]![0]).toMatchObject({ onlyPackages: ["@acme/a"] });
	});

	it("passes no list when none is given", async () => {
		await runCommand(publishPackageCommand, ["package", "--initial"]);
		expect("onlyPackages" in runPublish.mock.calls[0]![0]).toBe(false);
	});

	it("refuses a steady-state publish with it, publishing nothing", async () => {
		await runCommand(publishPackageCommand, ["package", "--package", "@acme/a"]);
		expect(runSteadyPublish).not.toHaveBeenCalled();
		expect(process.exitCode).toBe(1);
	});
});
