import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findExecutable, findExecutableSync } from "./find-executable.ts";

const onWindows = process.platform === "win32";

describe.each([
	["findExecutable", findExecutable],
	["findExecutableSync", async (...args: Parameters<typeof findExecutableSync>) => findExecutableSync(...args)],
] as const)("%s", (_name, find) => {
	let root: string;
	let binA: string;
	let binB: string;

	const script = async (dir: string, name: string, mode = 0o755) => {
		const file = join(dir, name);
		await writeFile(file, "#!/bin/sh\n");
		await chmod(file, mode);
		return file;
	};
	const posix = (...dirs: string[]) => ({ path: dirs.join(":"), platform: "linux" as const });
	const win = (dirs: string[], pathExt = ".EXE;.CMD") => ({
		path: dirs.join(";"),
		platform: "win32" as const,
		pathExt,
	});

	beforeEach(async () => {
		// realpath: macOS tmpdir is a symlink, and `process.cwd()` reports the resolved path
		root = await realpath(await mkdtemp(join(tmpdir(), "fs-utils-exec-")));
		binA = join(root, "a");
		binB = join(root, "b");
		await mkdir(binA);
		await mkdir(binB);
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	// Extensionless fixtures, `:`-joined paths and exec bits are POSIX semantics.
	describe.skipIf(onWindows)("POSIX lookup", () => {
		it("returns the first matching entry in path order", async () => {
			await script(binA, "tool");
			const inB = await script(binB, "tool");
			expect(await find("tool", posix(binB, binA))).toBe(inB);
		});

		it("falls through to a later entry when earlier ones lack it", async () => {
			const inB = await script(binB, "tool");
			expect(await find("tool", posix(binA, binB))).toBe(inB);
		});

		it("returns undefined when nothing matches, or the path is empty", async () => {
			expect(await find("tool", posix(binA))).toBeUndefined();
			expect(await find("tool", { path: "", platform: "linux" })).toBeUndefined();
		});

		it("skips empty entries instead of reading them as the working directory", async () => {
			const inCwd = await script(binA, "tool");
			const inB = await script(binB, "tool");
			const cwd = process.cwd();
			process.chdir(binA);
			try {
				const found = await find("tool", posix("", binB));
				expect(found).toBe(inB);
				expect(found).not.toBe(inCwd);
				expect(await find("tool", posix(""))).toBeUndefined();
			} finally {
				process.chdir(cwd);
			}
		});

		it("resolves relative entries against the working directory at call time", async () => {
			const inA = await script(binA, "tool");
			const cwd = process.cwd();
			process.chdir(root);
			try {
				expect(await find("tool", posix("a"))).toBe(inA);
			} finally {
				process.chdir(cwd);
			}
		});

		it("skips directories named like the command", async () => {
			await mkdir(join(binA, "tool"));
			const inB = await script(binB, "tool");
			expect(await find("tool", posix(binA, binB))).toBe(inB);
		});

		it("skips files without the exec bit", async () => {
			await script(binA, "tool", 0o644);
			const inB = await script(binB, "tool");
			expect(await find("tool", posix(binA, binB))).toBe(inB);
		});

		it("follows a symlink to an executable", async () => {
			const target = await script(binA, "real");
			await symlink(target, join(binB, "tool"));
			expect(await find("tool", posix(binB))).toBe(join(binB, "tool"));
		});

		it("skips search entries that don't exist or aren't directories", async () => {
			const file = await script(binA, "plain");
			const inB = await script(binB, "tool");
			expect(await find("tool", posix(join(root, "missing"), file, binB))).toBe(inB);
		});

		it("throws filesystem errors other than not-there / not-permitted", async () => {
			await symlink("loop", join(binA, "loop"));
			await expect(Promise.resolve().then(() => find("loop", posix(binA)))).rejects.toThrow(/ELOOP/);
		});

		it("reads process.env.PATH by default", async () => {
			const inA = await script(binA, "tool");
			const saved = process.env["PATH"];
			process.env["PATH"] = binA;
			try {
				expect(await find("tool")).toBe(inA);
			} finally {
				process.env["PATH"] = saved;
			}
		});

		it("finds nothing when PATH is unset", async () => {
			await script(binA, "tool");
			const saved = process.env["PATH"];
			delete process.env["PATH"];
			try {
				expect(await find("tool", { platform: "linux" })).toBeUndefined();
			} finally {
				process.env["PATH"] = saved;
			}
		});

		it("does not append extensions on POSIX", async () => {
			await script(binA, "tool.EXE");
			expect(await find("tool", { ...posix(binA), pathExt: ".EXE" })).toBeUndefined();
		});
	});

	// The `win32` options work on any host; these only need plain files.
	describe("Windows lookup", () => {
		it("splits the path on `;` whatever the host delimiter is", async () => {
			const inB = await script(binB, "tool.CMD", 0o644);
			expect(await find("tool", win([binA, binB]))).toBe(inB);
		});

		it("treats a bin that already carries a PATHEXT extension as complete", async () => {
			const exe = await script(binA, "git.exe", 0o644);
			await script(binA, "git.exe.EXE", 0o644);
			expect(await find("git.exe", win([binA]))).toBe(exe);
		});

		it("tries each PATHEXT extension in order and ignores the exec bit", async () => {
			await script(binA, "tool.CMD", 0o644);
			const exe = await script(binA, "tool.EXE", 0o644);
			expect(await find("tool", win([binA]))).toBe(exe);
		});

		it("falls back to the default PATHEXT", async () => {
			const exe = await script(binA, "tool.EXE", 0o644);
			const saved = process.env["PATHEXT"];
			delete process.env["PATHEXT"];
			try {
				expect(await find("tool", { path: binA, platform: "win32" })).toBe(exe);
			} finally {
				if (saved !== undefined) process.env["PATHEXT"] = saved;
			}
		});

		it("rejects a PATHEXT entry that could reach outside the searched directories", async () => {
			await script(root, "tool.EXE", 0o644);
			for (const ext of [".EXE;/../../tool.EXE", "\\..\\x", ".E\0XE"]) {
				await expect(Promise.resolve().then(() => find("tool", win([binA], ext)))).rejects.toThrow(TypeError);
			}
		});
	});

	it("rejects anything that isn't a bare command name", async () => {
		for (const bin of ["", ".", "..", "a/b", "a\\b", "a\0b"]) {
			await expect(Promise.resolve().then(() => find(bin, { path: binA }))).rejects.toThrow(TypeError);
		}
	});
});
