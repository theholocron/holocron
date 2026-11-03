import {
	existsSync,
	fstatSync,
	linkSync,
	mkdtempSync,
	openSync,
	readFileSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shredFile } from "./shred-file.js";

const dir = () => mkdtempSync(join(tmpdir(), "holocron-shred-"));

/** The file at `path` as the writer hands it over: its device and inode, and a descriptor held open. */
const held = (path: string, flags = "r+") => {
	const fd = openSync(path, flags);
	const { dev, ino } = fstatSync(fd);
	return { dev, ino, fd };
};

describe("shredFile", () => {
	it("overwrites the contents with zeros, then removes the file", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET=value\n");
		let seen: string | undefined;
		const outcome = shredFile(path, held(path), (p) => {
			seen = readFileSync(p).toString("latin1");
			unlinkSync(p);
		});
		expect(outcome).toBe("deleted");
		expect(seen).toBe("\0".repeat("SECRET=value\n".length));
		expect(existsSync(path)).toBe(false);
	});

	it("closes the descriptor it was handed", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "x");
		const identity = held(path);
		shredFile(path, identity);
		expect(() => fstatSync(identity.fd)).toThrow(/EBADF/);
	});

	it("is missing, not an error, when the path is already gone", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "x");
		const identity = held(path);
		unlinkSync(path);
		expect(shredFile(path, identity)).toBe("missing");
	});

	it("leaves a different file at the same path alone, even one created straight after, and still zeroes the original", () => {
		const d = dir();
		const path = join(d, ".credentials");
		writeFileSync(path, "SECRET=first");
		// A second name keeps the original's blocks reachable, so the test can see what was left in them.
		const survivor = join(d, "survivor");
		linkSync(path, survivor);
		const first = held(path);
		unlinkSync(path);
		// Created immediately: without the held descriptor a filesystem may hand this file the first one's inode.
		writeFileSync(path, "someone else's");
		expect(shredFile(path, first)).toBe("replaced");
		expect(readFileSync(path, "utf8")).toBe("someone else's");
		expect(readFileSync(survivor).toString("latin1")).toBe("\0".repeat("SECRET=first".length));
	});

	it("does not follow a symlink put in its place, so the target is never zeroed", () => {
		const d = dir();
		const path = join(d, ".credentials");
		const victim = join(d, "victim");
		writeFileSync(path, "mine");
		const mine = held(path);
		writeFileSync(victim, "important");
		unlinkSync(path);
		symlinkSync(victim, path);
		expect(shredFile(path, mine)).toBe("replaced");
		expect(readFileSync(victim, "utf8")).toBe("important");
	});

	it("still removes a file it cannot overwrite", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET");
		// A read-only descriptor: the overwrite fails, the removal does not depend on it.
		expect(shredFile(path, held(path, "r"))).toBe("deleted");
		expect(existsSync(path)).toBe(false);
	});

	it("throws, rather than say it deleted the file, when it cannot be removed", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET");
		expect(() =>
			shredFile(path, held(path), () => {
				throw new Error("EPERM");
			})
		).toThrow("EPERM");
		expect(existsSync(path)).toBe(true);
	});

	it("throws on a path it cannot even inspect", () => {
		const d = dir();
		const file = join(d, "file");
		writeFileSync(file, "a file where a directory would be");
		expect(() => shredFile(join(file, "child"), held(file))).toThrow(/ENOTDIR/);
	});

	it("is not an error when the descriptor is already closed", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "x");
		expect(shredFile(path, { ...held(path), fd: 9999 })).toBe("deleted");
	});
});
