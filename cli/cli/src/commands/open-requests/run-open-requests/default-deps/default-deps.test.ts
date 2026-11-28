import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defaultDeps } from "./default-deps.js";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "open-requests-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("defaultDeps file system", () => {
	it("makes the private directory owner-only, and is fine when it exists", () => {
		const { makeDir } = defaultDeps();
		makeDir(join(dir, "a", "b"));
		makeDir(join(dir, "a", "b"));
		expect(statSync(join(dir, "a", "b")).mode & 0o777).toBe(0o700);
	});

	it("writes a private file readable by its owner only, and never over an existing one", () => {
		const { createPrivateFile } = defaultDeps();
		const path = join(dir, "values.env");
		createPrivateFile(path, "A=1\n");
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(() => createPrivateFile(path, "B=2\n")).toThrow();
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
	});

	it("tells nothing, a link, a file's first line and anything else apart, without following a link", () => {
		const { inspect } = defaultDeps();
		expect(inspect(join(dir, "missing"))).toEqual({ kind: "none" });
		writeFileSync(join(dir, "file"), "# marker\nrest\n");
		expect(inspect(join(dir, "file"))).toEqual({ kind: "file", firstLine: "# marker" });
		writeFileSync(join(dir, "empty"), "");
		expect(inspect(join(dir, "empty"))).toEqual({ kind: "file", firstLine: "" });
		symlinkSync("file", join(dir, "link"));
		expect(inspect(join(dir, "link"))).toEqual({ kind: "symlink", to: "file" });
		symlinkSync("nowhere", join(dir, "dangling"));
		expect(inspect(join(dir, "dangling"))).toEqual({ kind: "symlink", to: "nowhere" });
		mkdirSync(join(dir, "folder"));
		expect(inspect(join(dir, "folder"))).toEqual({ kind: "other" });
	});

	it("rethrows an error that is not a missing path", () => {
		const { inspect } = defaultDeps();
		writeFileSync(join(dir, "file"), "x");
		expect(() => inspect(join(dir, "file", "inside"))).toThrow();
	});

	it("links and removes, and removing what is not there is fine", () => {
		const { symlink, remove, inspect } = defaultDeps();
		writeFileSync(join(dir, "target"), "x");
		symlink("target", join(dir, "link"));
		expect(inspect(join(dir, "link"))).toEqual({ kind: "symlink", to: "target" });
		remove(join(dir, "link"));
		remove(join(dir, "link"));
		expect(existsSync(join(dir, "target"))).toBe(true);
		expect(inspect(join(dir, "link"))).toEqual({ kind: "none" });
	});
});

describe("defaultDeps lock", () => {
	it("is taken, held against a second taker while its holder runs, and taken again once removed", () => {
		const { takeLock, remove } = defaultDeps();
		const lock = join(dir, "lock");
		expect(takeLock(lock, process.pid)).toBe(true);
		expect(readFileSync(lock, "utf8")).toBe(String(process.pid));
		expect(takeLock(lock, process.pid)).toBe(false);
		remove(lock);
		expect(takeLock(lock, process.pid)).toBe(true);
	});

	it("replaces the lock of a process that has ended, and of a file that holds no pid", () => {
		const { takeLock } = defaultDeps();
		const lock = join(dir, "lock");
		const ended = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]);
		writeFileSync(lock, String(ended.stdout));
		expect(takeLock(lock, process.pid)).toBe(true);
		expect(readFileSync(lock, "utf8")).toBe(String(process.pid));
		writeFileSync(lock, "not a pid");
		expect(takeLock(lock, 77)).toBe(true);
		expect(readFileSync(lock, "utf8")).toBe("77");
	});

	it("rethrows an error that is not about the lock existing", () => {
		const { takeLock } = defaultDeps();
		expect(() => takeLock(join(dir, "missing-dir", "lock"), 1)).toThrow();
	});
});

describe("defaultDeps ignore check", () => {
	it("asks git, and says no repository outside one", () => {
		const { isIgnored } = defaultDeps();
		const outside = mkdtempSync(join(tmpdir(), "open-requests-nogit-"));
		try {
			expect(["no-repo", "unknown"]).toContain(isIgnored(join(outside, "x")));
		} finally {
			rmSync(outside, { recursive: true, force: true });
		}
	});
});
