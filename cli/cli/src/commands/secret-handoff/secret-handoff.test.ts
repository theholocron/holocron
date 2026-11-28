import { mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FileIdentity } from "@theholocron/kyber/secrets";
import { describe, expect, it, vi } from "vitest";

import { handOffSecret } from "./secret-handoff.js";

// An obviously fake value: a real one is a credential.
const FAKE = "fake-value-0000";
const identity: FileIdentity = { dev: 1, ino: 2, fd: -1 };

function run(over: Partial<Parameters<typeof handOffSecret>[0]> = {}) {
	const printed: string[] = [];
	const writeFile = vi.fn((_path: string, _text: string, _force: boolean) => identity);
	const shred = vi.fn(() => "deleted" as const);
	const input = {
		name: "CRON_SECRET",
		value: FAKE,
		base: "/repo",
		print: (line: string) => printed.push(line),
		interactive: true,
		makeDir: () => undefined,
		isIgnored: () => "ignored" as const,
		writeFile,
		shred,
		waitForImport: async () => undefined,
		platform: "darwin",
		...over,
	};
	return { result: handOffSecret(input), printed, writeFile, shred };
}

describe("handOffSecret", () => {
	it("writes NAME=value to the private file, never overwriting, then deletes it after the import", async () => {
		const { result, writeFile, shred } = run();
		expect(await result).toEqual({ status: "ok" });
		expect(writeFile).toHaveBeenCalledWith("/repo/.holocron/.private/.credentials", `CRON_SECRET=${FAKE}\n`, false);
		expect(shred).toHaveBeenCalledOnce();
	});

	it("never prints the value, and names the Environment when it is given", async () => {
		const { result, printed } = run({ environment: "theholocron/holocron - prod" });
		await result;
		const text = printed.join("\n");
		expect(text).not.toContain(FAKE);
		expect(text).toContain("CRON_SECRET");
		expect(text).toContain("theholocron/holocron - prod");
	});

	it("leaves the file and says to delete it without a terminal", async () => {
		const path = process.platform === "win32" ? "NUL" : "/dev/null";
		const { result, printed, shred } = run({
			interactive: false,
			writeFile: () => ({ dev: 1, ino: 2, fd: openSync(path, "r") }),
		});
		expect((await result).status).toBe("ok");
		expect(shred).not.toHaveBeenCalled();
		expect(printed.join("\n")).toContain("delete it when you are done");
	});

	it.each([
		["tracked", "tracked" as const],
		["unknown", "unknown" as const],
	])("refuses when git says %s", async (_label, state) => {
		const { result, writeFile } = run({ isIgnored: () => state });
		expect(await result).toMatchObject({ status: "fail", reason: "not-ignored" });
		expect(writeFile).not.toHaveBeenCalled();
	});

	it("refuses on Windows", async () => {
		const { result, writeFile } = run({ platform: "win32" });
		expect(await result).toMatchObject({ status: "fail", reason: "windows" });
		expect(writeFile).not.toHaveBeenCalled();
	});

	it("takes the platform, git's answer and the file writer from the process when none are given, and never prints the value", async () => {
		const base = mkdtempSync(join(tmpdir(), "secret-handoff-"));
		try {
			const { result, printed } = run({
				base,
				platform: undefined,
				isIgnored: undefined,
				writeFile: undefined,
				makeDir: undefined,
				interactive: false,
			});
			expect(["ok", "fail"]).toContain((await result).status);
			expect(printed.join("\n")).not.toContain(FAKE);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("refuses a value a dotenv file cannot carry, writing nothing", async () => {
		const { result, writeFile } = run({ value: "a'b\"c`d\ne\\" });
		expect(await result).toMatchObject({ status: "fail", reason: "unsupported" });
		expect(writeFile).not.toHaveBeenCalled();
	});

	it("says where the file is when it could not be deleted, without the value", async () => {
		const { result, printed } = run({
			shred: () => {
				throw new Error("busy");
			},
		});
		expect(await result).toMatchObject({ status: "fail", reason: "file-left" });
		expect(printed.join("\n")).toContain("delete it yourself");
		expect(printed.join("\n")).not.toContain(FAKE);
	});

	it("reports a write that fails, naming the file and not the value", async () => {
		const { result, printed } = run({
			writeFile: () => {
				throw new Error("EEXIST");
			},
		});
		expect(await result).toMatchObject({ status: "fail", reason: "write" });
		const text = printed.join("\n");
		expect(text).toContain("EEXIST");
		expect(text).not.toContain(FAKE);
	});
});
