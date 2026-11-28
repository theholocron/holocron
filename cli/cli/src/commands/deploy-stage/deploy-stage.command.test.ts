import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stageDeploy = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock("./deploy-stage.js", () => ({ stageDeploy }));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));

import { runCommand } from "../run-command.testing.js";
import { deployStageCommand } from "./deploy-stage.command.js";

const go = (args: string[]) => runCommand(deployStageCommand, args);

beforeEach(() => {
	vi.clearAllMocks();
	stageDeploy.mockReturnValue({ status: "ok" });
});
afterEach(() => void (process.exitCode = undefined));

describe("deploy stage", () => {
	it("stages the current directory by default, with no --out", async () => {
		await go(["stage"]);
		const input = stageDeploy.mock.calls[0]![0];
		expect(input.packageDir).toBe("/repo");
		expect(input).not.toHaveProperty("outDir");
		expect(process.exitCode).toBeUndefined();
	});

	it("resolves --package-dir and --out against --cwd", async () => {
		await go(["stage", "--package-dir", "apps/sentinel", "--out", "payload"]);
		expect(stageDeploy.mock.calls[0]![0]).toMatchObject({
			packageDir: "/repo/apps/sentinel",
			outDir: "/repo/payload",
		});
	});

	it("prints each line the staging reports", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		stageDeploy.mockImplementation(({ print }: { print: (l: string) => void }) => {
			print("Staged");
			return { status: "ok" };
		});
		await go(["stage"]);
		expect(log).toHaveBeenCalledWith("Staged");
		log.mockRestore();
	});

	it("reports the failure and exits 1", async () => {
		stageDeploy.mockReturnValue({ status: "fail", message: "no dist" });
		await go(["stage"]);
		expect(reportError).toHaveBeenCalledWith("deploy stage: no dist");
		expect(process.exitCode).toBe(1);
	});
});
