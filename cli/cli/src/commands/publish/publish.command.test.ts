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

import { runCommand } from "../../testing/run-command.js";
import { publishCommand } from "./publish.command.js";

beforeEach(() => {
	vi.clearAllMocks();
	process.exitCode = undefined;
	runPublish.mockResolvedValue({ status: "ok", packageNames: ["a"] });
	runSteadyPublish.mockResolvedValue({ status: "ok", packageNames: ["a"] });
	runSyncTrust.mockResolvedValue({ status: "ok" });
});

describe("publish command's --group", () => {
	it("steady-state publishes the whole workspace without it", async () => {
		await runCommand(publishCommand, ["publish"]);
		expect("group" in runSteadyPublish.mock.calls[0]![0]).toBe(false);
	});

	it("steady-state publishes one group with it", async () => {
		await runCommand(publishCommand, ["publish", "--group", "clients", "--skip-already-published"]);
		expect(runSteadyPublish.mock.calls[0]![0]).toMatchObject({ group: "clients", skipAlreadyPublished: true });
	});

	it("--initial bootstraps only the group's packages, or all without it", async () => {
		await runCommand(publishCommand, ["publish", "--initial", "--group", "observability"]);
		expect(runPublish.mock.calls[0]![0]).toMatchObject({ group: "observability" });
		await runCommand(publishCommand, ["publish", "--initial"]);
		expect("group" in runPublish.mock.calls[1]![0]).toBe(false);
	});

	it("--sync-trust migrates only the group's packages, or all without it", async () => {
		await runCommand(publishCommand, ["publish", "--sync-trust", "old.yml", "new.yml", "--group", "utils"]);
		expect(runSyncTrust.mock.calls[0]![0]).toMatchObject({
			oldFile: "old.yml",
			newFile: "new.yml",
			group: "utils",
		});
		await runCommand(publishCommand, ["publish", "--sync-trust", "old.yml", "new.yml"]);
		expect("group" in runSyncTrust.mock.calls[1]![0]).toBe(false);
	});
});
