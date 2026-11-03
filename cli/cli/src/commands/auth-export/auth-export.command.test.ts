import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadConfig = vi.hoisted(() => vi.fn());
const runAuthExport = vi.hoisted(() => vi.fn());
vi.mock("../../config/index.js", () => ({ loadConfig }));
vi.mock("./auth-export.js", () => ({ runAuthExport }));

import { runCommand } from "../../testing/run-command.js";
import { authExportCommand } from "./auth-export.command.js";

beforeEach(() => {
	vi.clearAllMocks();
	loadConfig.mockResolvedValue({ resolved: {}, filepath: "/x" });
	runAuthExport.mockResolvedValue({ status: "ok", exported: [], missing: [] });
});
afterEach(() => void (process.exitCode = undefined));

describe("auth export command", () => {
	it("runs the export with the loaded config, writing to stdout", async () => {
		await runCommand(authExportCommand, ["export"]);
		const input = runAuthExport.mock.calls[0]![0];
		expect(input.loaded).toEqual({ resolved: {}, filepath: "/x" });
		expect(input.fromEnv).toBe(false);
		// Under test stdout is not a terminal; whichever it is, the command says what it is.
		expect(["terminal", "pipe", "other"]).toContain(input.outKind);
		const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		try {
			input.out("A=1\n");
			expect(write).toHaveBeenCalledWith("A=1\n");
		} finally {
			write.mockRestore();
		}
	});

	it("passes --from-env", async () => {
		await runCommand(authExportCommand, ["export", "--from-env"]);
		expect(runAuthExport.mock.calls[0]![0].fromEnv).toBe(true);
	});

	it("passes no target by default, so a terminal gets the file and a pipe stdout", async () => {
		await runCommand(authExportCommand, ["export"]);
		const input = runAuthExport.mock.calls[0]![0];
		expect(input.to).toBeUndefined();
		expect(input.file).toBeUndefined();
		expect(input.force).toBe(false);
		expect(input.keep).toBe(false);
		expect(typeof input.interactive).toBe("boolean");
	});

	it("--file picks the file, with its path when given, and --force and --keep pass through", async () => {
		await runCommand(authExportCommand, ["export", "--file", "out/.credentials", "--force", "--keep"]);
		expect(runAuthExport.mock.calls[0]![0]).toMatchObject({
			to: "file",
			file: "out/.credentials",
			force: true,
			keep: true,
		});
		runAuthExport.mockClear();
		await runCommand(authExportCommand, ["export", "--file"]);
		const bare = runAuthExport.mock.calls[0]![0];
		expect(bare.to).toBe("file");
		expect(bare.file).toBeUndefined();
	});

	it("--copy picks the clipboard", async () => {
		await runCommand(authExportCommand, ["export", "--copy"]);
		expect(runAuthExport.mock.calls[0]![0].to).toBe("clipboard");
	});

	it("exits 1 when it failed, but not on a skip", async () => {
		runAuthExport.mockResolvedValueOnce({ status: "skip", exported: [], missing: [] });
		await runCommand(authExportCommand, ["export"]);
		expect(process.exitCode).toBeUndefined();
		runAuthExport.mockResolvedValueOnce({ status: "fail", exported: [], missing: [] });
		await runCommand(authExportCommand, ["export"]);
		expect(process.exitCode).toBe(1);
	});

	it("is the `export` subcommand", () => {
		expect(authExportCommand.command).toBe("export");
	});
});
