import { beforeEach, describe, expect, it, vi } from "vitest";

const runMoveTag = vi.hoisted(() => vi.fn());
vi.mock("./index.js", async (importActual) => ({
	...(await importActual<typeof import("./index.js")>()),
	runMoveTag,
}));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_entry: unknown, argv: Record<string, unknown>) => [argv["group"]],
}));

import { runCommand } from "../../testing/run-command.js";
import { moveTagCommand } from "./move-tag.command.js";

beforeEach(() => {
	vi.clearAllMocks();
	process.exitCode = undefined;
	runMoveTag.mockResolvedValue({ status: "ok", tag: "ci-v1", target: "ci-v1.4.0" });
});

describe("package move-tag command", () => {
	it("moves the group's major tag to its latest stable release, on origin", async () => {
		await runCommand(moveTagCommand, ["move-tag", "ci"]);
		const input = runMoveTag.mock.calls[0]![0];
		expect(input).toMatchObject({ group: "ci", cwd: "/repo", dryRun: false, remote: "origin" });
		expect("version" in input).toBe(false);
	});

	it("passes the release, the remote and --dry-run through", async () => {
		await runCommand(moveTagCommand, ["move-tag", "ci", "1.4.0", "--remote", "upstream", "--dry-run"]);
		expect(runMoveTag.mock.calls[0]![0]).toMatchObject({
			group: "ci",
			version: "1.4.0",
			remote: "upstream",
			dryRun: true,
		});
	});

	it("exits 1 when the tag could not be moved", async () => {
		runMoveTag.mockResolvedValue({ status: "fail", message: "no stable ci-v<version> tag" });
		await runCommand(moveTagCommand, ["move-tag", "ci"]);
		expect(process.exitCode).toBe(1);
	});
});
