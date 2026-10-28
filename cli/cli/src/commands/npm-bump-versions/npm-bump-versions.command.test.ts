import { beforeEach, describe, expect, it, vi } from "vitest";

const runNpmBumpVersions = vi.hoisted(() => vi.fn());
vi.mock("./index.js", async (importActual) => ({
	...(await importActual<typeof import("./index.js")>()),
	runNpmBumpVersions,
}));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	promptForPositionals: async (_entry: unknown, argv: Record<string, unknown>) => [argv["new-version"]],
}));

import { runCommand } from "../../testing/run-command.js";
import { npmBumpVersionsCommand } from "./npm-bump-versions.command.js";

beforeEach(() => {
	vi.clearAllMocks();
	process.exitCode = undefined;
	runNpmBumpVersions.mockResolvedValue({ status: "ok", bumped: [], skipped: [] });
});

describe("package bump-versions command", () => {
	it("bumps the whole workspace when no group is given", async () => {
		await runCommand(npmBumpVersionsCommand, ["bump-versions", "2.0.0"]);
		const input = runNpmBumpVersions.mock.calls[0]![0];
		expect(input).toMatchObject({ version: "2.0.0", cwd: "/repo", dryRun: false });
		expect("group" in input).toBe(false);
	});

	it("passes --group through, with --dry-run", async () => {
		await runCommand(npmBumpVersionsCommand, ["bump-versions", "2.0.0", "--group", "clients", "--dry-run"]);
		expect(runNpmBumpVersions.mock.calls[0]![0]).toMatchObject({
			version: "2.0.0",
			group: "clients",
			dryRun: true,
		});
	});

	it("exits 1 when the bump fails", async () => {
		runNpmBumpVersions.mockResolvedValue({ status: "fail", bumped: [], skipped: [], message: "no packages" });
		await runCommand(npmBumpVersionsCommand, ["bump-versions", "2.0.0", "--group", "skills"]);
		expect(process.exitCode).toBe(1);
	});
});
