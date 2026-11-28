import { mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FileIdentity } from "@theholocron/kyber/secrets";
import { describe, expect, it, vi } from "vitest";

import { handOffHeartbeats } from "./heartbeat-handoff.js";

// An obviously fake address: a real ping URL is a credential.
const FAKE_PING = "https://ping.invalid/00000000-0000-0000-0000-000000000000";
const identity: FileIdentity = { dev: 1, ino: 2, fd: -1 };

function run(over: Partial<Parameters<typeof handOffHeartbeats>[0]> = {}) {
	const printed: string[] = [];
	const writeFile = vi.fn((_path: string, _text: string, _force: boolean) => identity);
	const shred = vi.fn(() => "deleted" as const);
	const input = {
		pings: [{ name: "check-tokens", url: FAKE_PING }],
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
	return { result: handOffHeartbeats(input), printed, writeFile, shred };
}

describe("handOffHeartbeats", () => {
	it("writes NAME=url to the private file, never overwriting, then deletes it after the import", async () => {
		const { result, printed, writeFile, shred } = run();
		expect(await result).toEqual({ status: "ok", written: ["HOLOCRON_HEARTBEAT_CHECK_TOKENS"] });
		expect(writeFile).toHaveBeenCalledWith(
			"/repo/.holocron/.private/.credentials",
			`HOLOCRON_HEARTBEAT_CHECK_TOKENS=${FAKE_PING}\n`,
			false
		);
		expect(shred).toHaveBeenCalledOnce();
		expect(printed.join("\n")).toContain("HOLOCRON_HEARTBEAT_CHECK_TOKENS");
	});

	it("never prints the URL", async () => {
		const { result, printed } = run();
		await result;
		expect(printed.join("\n")).not.toContain("ping.invalid");
	});

	it("leaves the file and says to delete it without a terminal", async () => {
		const { result, printed, shred } = run({
			interactive: false,
			writeFile: () => ({ dev: 1, ino: 2, fd: openFd() }),
		});
		expect((await result).status).toBe("ok");
		expect(shred).not.toHaveBeenCalled();
		expect(printed.join("\n")).toContain("delete it when you are done");
	});

	it("is a skip when nothing was made", async () => {
		const { result, writeFile } = run({ pings: [] });
		expect((await result).status).toBe("skip");
		expect(writeFile).not.toHaveBeenCalled();
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

	it("fails when two heartbeats make the same secret name, or one has no usable name", async () => {
		const clash = run({
			pings: [
				{ name: "a-b", url: FAKE_PING },
				{ name: "a b", url: FAKE_PING },
			],
		});
		expect(await clash.result).toMatchObject({ status: "fail", reason: "collision" });
		const blank = run({ pings: [{ name: "--", url: FAKE_PING }] });
		expect(await blank.result).toMatchObject({ status: "fail", reason: "name" });
	});

	it("fails without echoing the URL when the file cannot be written", async () => {
		const { result, printed } = run({
			writeFile: () => {
				throw new Error("EEXIST");
			},
		});
		expect(await result).toMatchObject({ status: "fail", reason: "write" });
		expect(printed.join("\n")).not.toContain("ping.invalid");
	});

	it("fails when the address cannot be carried by a dotenv file", async () => {
		const { result } = run({ pings: [{ name: "x", url: "a'b\"c`d\ne\\" }] });
		expect(await result).toMatchObject({ status: "fail", reason: "unsupported" });
	});

	it("says where the file is when it could not be deleted", async () => {
		const { result, printed } = run({
			shred: () => {
				throw new Error("busy");
			},
		});
		expect(await result).toMatchObject({ status: "fail", reason: "file-left" });
		expect(printed.join("\n")).toContain("delete it yourself");
		expect(printed.join("\n")).not.toContain(FAKE_PING);
	});

	it("writes with the real file writer when none is given", async () => {
		const base = mkdtempSync(join(tmpdir(), "heartbeat-handoff-"));
		try {
			const { result } = run({ base, writeFile: undefined, makeDir: undefined, interactive: false });
			expect((await result).status).toBe("ok");
			expect(readFileSync(join(base, ".holocron/.private/.credentials"), "utf8")).toBe(
				`HOLOCRON_HEARTBEAT_CHECK_TOKENS=${FAKE_PING}\n`
			);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("takes the platform and git's answer from the process when none are given, and never prints the URL", async () => {
		const base = mkdtempSync(join(tmpdir(), "heartbeat-handoff-"));
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
			expect(printed.join("\n")).not.toContain(FAKE_PING);
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});

/** A descriptor that exists, for the path where the file is left in place and its descriptor closed. */
function openFd(): number {
	return openSync("/dev/null", "r");
}
