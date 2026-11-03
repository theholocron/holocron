import {
	closeSync,
	existsSync,
	fstatSync,
	linkSync,
	mkdtempSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { writeCredentialsFile } from "./credentials-file.js";

const dir = () => mkdtempSync(join(tmpdir(), "holocron-credfile-"));

describe("writeCredentialsFile", () => {
	it("writes the text to a file only its owner can read, and says which file it is", () => {
		const path = join(dir(), ".credentials");
		const identity = writeCredentialsFile(path, "A=1\n");
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(identity).toMatchObject({ dev: statSync(path).dev, ino: statSync(path).ino });
		// The descriptor is still open, and is the file that was written, so cleanup can reach it through the path's replacement.
		expect(fstatSync(identity.fd).ino).toBe(identity.ino);
		writeSync(identity.fd, "B", 0);
		closeSync(identity.fd);
	});

	it("will not replace a file that is already there, and leaves it as it was", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "keep me");
		expect(() => writeCredentialsFile(path, "A=1\n")).toThrow(/EEXIST/);
		expect(readFileSync(path, "utf8")).toBe("keep me");
	});

	it("replaces it with force, leaves it private, and zeroes what the old file held", () => {
		const d = dir();
		const path = join(d, ".credentials");
		writeFileSync(path, "OLD_TOKEN=abc", { mode: 0o644 });
		// A second name for the old file keeps its blocks reachable, so the test can see what was left in them.
		const survivor = join(d, "survivor");
		linkSync(path, survivor);
		writeCredentialsFile(path, "A=1\n", true);
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(readFileSync(survivor).toString("latin1")).toBe("\0".repeat("OLD_TOKEN=abc".length));
	});

	it("writes with force when there was nothing to replace", () => {
		const path = join(dir(), ".credentials");
		writeCredentialsFile(path, "A=1\n", true);
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
	});

	it("replaces a symlink with force without touching what it points to", () => {
		const d = dir();
		const victim = join(d, "victim");
		const path = join(d, ".credentials");
		writeFileSync(victim, "important");
		symlinkSync(victim, path);
		writeCredentialsFile(path, "A=1\n", true);
		expect(readFileSync(victim, "utf8")).toBe("important");
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
	});

	it("never writes through a symlink that is there without force", () => {
		const d = dir();
		const victim = join(d, "victim");
		const path = join(d, ".credentials");
		writeFileSync(victim, "important");
		symlinkSync(victim, path);
		expect(() => writeCredentialsFile(path, "A=1\n")).toThrow(/EEXIST/);
		expect(readFileSync(victim, "utf8")).toBe("important");
	});

	it("removes the file it created when the write fails, so no plaintext is left", () => {
		const path = join(dir(), ".credentials");
		expect(() =>
			writeCredentialsFile(path, "A=1\n", false, () => {
				throw new Error("ENOSPC");
			})
		).toThrow("ENOSPC");
		expect(existsSync(path)).toBe(false);
	});

	it("throws when the directory is not there, leaving nothing behind", () => {
		const path = join(dir(), "missing", ".credentials");
		expect(() => writeCredentialsFile(path, "A=1\n")).toThrow(/ENOENT/);
		expect(existsSync(path)).toBe(false);
	});

	it("throws, for a reason other than a missing file, when it cannot clear the old one", () => {
		const d = dir();
		writeFileSync(join(d, "a-file"), "x");
		// "a-file" is a file, so asking for something inside it fails with ENOTDIR, not ENOENT.
		expect(() => writeCredentialsFile(join(d, "a-file", ".credentials"), "A=1\n", true)).toThrow(/ENOTDIR/);
	});
});
