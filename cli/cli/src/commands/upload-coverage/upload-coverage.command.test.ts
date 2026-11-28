import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const tokenContext = vi.hoisted(() => vi.fn());
const runUploadCoverage = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../config/index.js")>()),
	loadConfig,
}));
vi.mock("./run-upload-coverage/run-upload-coverage.js", () => ({ runUploadCoverage }));
vi.mock("../token-context/index.js", () => ({ tokenContext }));
vi.mock("../apply-resolved-config/index.js", () => ({ applyResolvedConfig: vi.fn() }));
vi.mock("../resolve-org/index.js", () => ({ resolveOrg: (_a: unknown, c: { org?: string }) => c.org }));

import { runCommand } from "../run-command.testing.js";
import { uploadCommand } from "../upload/upload.command.js";

const go = (...args: string[]) => runCommand(uploadCommand, ["upload", "coverage", ...args]);
const UPLOADS = '[{"flag":"a","files":"a"}]';

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: { org: "acme" }, filepath: "/x" });
	tokenContext.mockReturnValue({ cliToken: "t" });
	runUploadCoverage.mockResolvedValue({ status: "ok", rows: [], uploaded: 0 });
});
afterEach(() => void (process.exitCode = undefined));

describe("upload coverage", () => {
	it("appends uploaded=<n> to GITHUB_OUTPUT when it is set", async () => {
		const file = join(mkdtempSync(join(tmpdir(), "upload-out-")), "out");
		vi.stubEnv("GITHUB_OUTPUT", file);
		runUploadCoverage.mockResolvedValue({ status: "ok", rows: [], uploaded: 2 });
		await go("--uploads", UPLOADS);
		vi.unstubAllEnvs();
		expect(readFileSync(file, "utf8")).toBe("uploaded=2\n");
	});

	it("writes no output file without GITHUB_OUTPUT", async () => {
		vi.stubEnv("GITHUB_OUTPUT", "");
		await go("--uploads", UPLOADS);
		vi.unstubAllEnvs();
		expect(runUploadCoverage).toHaveBeenCalled();
	});

	it("passes the config, the context, --uploads and --allow-empty", async () => {
		await go("--uploads", UPLOADS, "--allow-empty");
		expect(runUploadCoverage).toHaveBeenCalledWith(
			expect.objectContaining({
				uploads: UPLOADS,
				allowEmpty: true,
				context: expect.objectContaining({ repoRoot: "/repo", cliToken: "t", org: "acme" }),
			})
		);
	});

	it("leaves allow-empty out and passes dry-run when asked", async () => {
		await go("--uploads", UPLOADS, "--dry-run");
		const input = runUploadCoverage.mock.calls[0]![0];
		expect(input).not.toHaveProperty("allowEmpty");
		expect(input.context.dryRun).toBe(true);
	});

	it("does nothing without tokens, and sets a failing exit code", async () => {
		tokenContext.mockReturnValueOnce(undefined);
		await go("--uploads", UPLOADS);
		expect(runUploadCoverage).not.toHaveBeenCalled();
		runUploadCoverage.mockResolvedValueOnce({ status: "fail", rows: [], uploaded: 0 });
		await go("--uploads", UPLOADS);
		expect(process.exitCode).toBe(1);
	});
});
