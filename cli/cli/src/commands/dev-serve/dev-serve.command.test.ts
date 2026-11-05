import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runDevServe = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./dev-serve.js", () => ({ runDevServe }));
vi.mock("../../observability/logger/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../observability/logger/index.js")>()),
	reportError,
}));

import { runCommand } from "../../testing/run-command.js";
import { devServeCommand } from "./dev-serve.command.js";

const SERVE = { handler: "./h.ts", export: "handle" };
const go = () => runCommand(devServeCommand, ["serve"]);
const saved = process.env["PORT"];

beforeEach(() => {
	vi.clearAllMocks();
	delete process.env["PORT"];
	loadConfig.mockResolvedValue({ resolved: { dev: { environment: "Dev", port: 4100, serve: SERVE } } });
	runDevServe.mockResolvedValue(undefined);
});
afterEach(() => {
	process.exitCode = undefined;
	if (saved === undefined) delete process.env["PORT"];
	else process.env["PORT"] = saved;
});

describe("dev serve", () => {
	it("serves the configured handler on the config's port", async () => {
		await go();
		expect(runDevServe).toHaveBeenCalledWith({ cwd: "/repo", environment: "Dev", serve: SERVE, port: 4100 });
	});

	it("prefers the PORT holocron dev sets, and falls back to 3000", async () => {
		process.env["PORT"] = "5000";
		await go();
		expect(runDevServe.mock.calls[0]![0].port).toBe(5000);
		loadConfig.mockResolvedValue({ resolved: { dev: { serve: SERVE } } });
		delete process.env["PORT"];
		await go();
		expect(runDevServe.mock.calls[1]![0]).toMatchObject({ port: 3000, environment: "" });
	});

	it("fails, saying what is missing, without a dev.serve block", async () => {
		loadConfig.mockResolvedValue({ resolved: {} });
		await go();
		expect(reportError).toHaveBeenCalledWith(expect.stringContaining("dev.serve"));
		expect(process.exitCode).toBe(1);
		expect(runDevServe).not.toHaveBeenCalled();
	});

	it("reports a failure to serve and exits 1", async () => {
		runDevServe.mockRejectedValue(new Error("missing from the environment: A"));
		await go();
		expect(reportError).toHaveBeenCalledWith("dev serve: missing from the environment: A");
		expect(process.exitCode).toBe(1);
	});
});
