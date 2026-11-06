import { closeSync, mkdtempSync, openSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { FileIdentity } from "../credentials-file/credentials-file.type.js";
import { finishCredentialsFile } from "./finish-credentials-file.js";

const identity: FileIdentity = { dev: 1, ino: 2, fd: -1 };

const setup = () => {
	const lines: string[] = [];
	return { lines, print: (line: string) => void lines.push(line) };
};

afterEach(() => vi.restoreAllMocks());

describe("finishCredentialsFile", () => {
	it("keeps the file with --keep and closes the descriptor", async () => {
		const dir = mkdtempSync(join(tmpdir(), "kyber-finish-"));
		const path = join(dir, ".credentials");
		writeFileSync(path, "A=1\n");
		const fd = openSync(path, "r+");
		const { lines, print } = setup();
		const shred = vi.fn();
		const ok = await finishCredentialsFile({
			path,
			identity: { dev: 1, ino: 2, fd },
			print,
			holds: "your tokens",
			importHint: "import it",
			keep: true,
			interactive: true,
			shred,
		});
		expect(ok).toBe(true);
		expect(shred).not.toHaveBeenCalled();
		expect(statSync(path).isFile()).toBe(true);
		expect(() => closeSync(fd)).toThrow();
		expect(lines).toEqual([
			`wrote ${path} (readable only by you)`,
			"import it",
			`it holds your tokens in plain text: delete it when you are done: ${path}`,
		]);
	});

	it("leaves the file without a terminal", async () => {
		const dir = mkdtempSync(join(tmpdir(), "kyber-finish-"));
		const path = join(dir, ".credentials");
		writeFileSync(path, "A=1\n");
		const fd = openSync(path, "r+");
		const { lines, print } = setup();
		const wait = vi.fn();
		const ok = await finishCredentialsFile({
			path,
			identity: { dev: 1, ino: 2, fd },
			print,
			holds: "x",
			importHint: "hint",
			waitForImport: wait,
		});
		expect(ok).toBe(true);
		expect(wait).not.toHaveBeenCalled();
		expect(lines).toHaveLength(3);
	});

	it.each([
		["deleted", "deleted /p"],
		["missing", "/p was already gone"],
		["replaced", "left /p alone: it is no longer the file this command wrote"],
	] as const)("waits, then reports %s", async (outcome, line) => {
		const { lines, print } = setup();
		const wait = vi.fn().mockResolvedValue("enter");
		const shred = vi.fn().mockReturnValue(outcome);
		const ok = await finishCredentialsFile({
			path: "/p",
			identity,
			print,
			holds: "x",
			importHint: "hint",
			interactive: true,
			shred,
			waitForImport: wait,
		});
		expect(ok).toBe(true);
		expect(wait).toHaveBeenCalledWith("press Enter when the import is done and the file will be deleted: ");
		expect(shred).toHaveBeenCalledWith("/p", identity);
		expect(lines.at(-1)).toBe(line);
		expect(process.listenerCount("SIGINT")).toBe(process.listenerCount("SIGINT"));
	});

	it("says so and returns false when the file cannot be deleted", async () => {
		const { lines, print } = setup();
		const ok = await finishCredentialsFile({
			path: "/p",
			identity,
			print,
			holds: "the App's credentials",
			importHint: "hint",
			interactive: true,
			shred: () => {
				throw new Error("EPERM");
			},
			waitForImport: () => Promise.resolve("enter"),
		});
		expect(ok).toBe(false);
		expect(lines.slice(-2)).toEqual([
			"could not delete /p: EPERM",
			"it holds the App's credentials in plain text: delete it yourself: /p",
		]);
	});

	it("still deletes the file when the wait throws, and removes its signal handlers", async () => {
		const before = process.listenerCount("SIGINT");
		const { print } = setup();
		const shred = vi.fn().mockReturnValue("deleted");
		await expect(
			finishCredentialsFile({
				path: "/p",
				identity,
				print,
				holds: "x",
				importHint: "hint",
				interactive: true,
				shred,
				waitForImport: () => Promise.reject(new Error("boom")),
			})
		).rejects.toThrow("boom");
		expect(shred).toHaveBeenCalledOnce();
		expect(process.listenerCount("SIGINT")).toBe(before);
	});

	it.each([
		["SIGINT", 130],
		["SIGTERM", 143],
		["SIGHUP", 129],
	] as const)("deletes the file and exits %s with %i", async (signal, code) => {
		const { lines, print } = setup();
		const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
		const shred = vi.fn().mockReturnValue("deleted");
		let release!: () => void;
		const pending = finishCredentialsFile({
			path: "/p",
			identity,
			print,
			holds: "x",
			importHint: "hint",
			interactive: true,
			shred,
			waitForImport: () => new Promise<void>((resolve) => (release = resolve)),
		});
		process.emit(signal, signal);
		expect(shred).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledWith(code);
		expect(lines).toContain("deleted /p");
		release();
		await pending;
	});

	it("uses shredFile and waitForEnter by default", async () => {
		const dir = mkdtempSync(join(tmpdir(), "kyber-finish-"));
		const path = join(dir, ".credentials");
		writeFileSync(path, "A=1\n");
		const fd = openSync(path, "r+");
		const st = statSync(path);
		const { Readable } = await import("node:stream");
		const { PassThrough } = await import("node:stream");
		const stdin = Object.assign(new PassThrough(), { isTTY: true });
		vi.spyOn(process, "stdin", "get").mockReturnValue(stdin as never);
		vi.spyOn(process.stderr, "write").mockReturnValue(true);
		void Readable;
		const { lines, print } = setup();
		const pending = finishCredentialsFile({
			path,
			identity: { dev: st.dev, ino: st.ino, fd },
			print,
			holds: "x",
			importHint: "hint",
			interactive: true,
		});
		stdin.write("\n");
		expect(await pending).toBe(true);
		expect(lines.at(-1)).toBe(`deleted ${path}`);
		expect(() => statSync(path)).toThrow();
	});
});
