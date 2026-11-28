import {
	closeSync,
	existsSync,
	fstatSync,
	mkdtempSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createPrivateFile } from "./private-file.js";

const dir = () => mkdtempSync(join(tmpdir(), "holocron-private-"));

describe("createPrivateFile", () => {
	it("creates the file with the text, readable only by its owner, and returns it with its descriptor open", () => {
		const path = join(dir(), "f");
		const identity = createPrivateFile(path, "A=1\n");
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(identity).toMatchObject({ dev: statSync(path).dev, ino: statSync(path).ino });
		expect(fstatSync(identity.fd).ino).toBe(identity.ino);
		closeSync(identity.fd);
	});

	it("will not replace a file that is there, and leaves it as it was", () => {
		const path = join(dir(), "f");
		writeFileSync(path, "keep me");
		expect(() => createPrivateFile(path, "A=1\n")).toThrow(/EEXIST/);
		expect(readFileSync(path, "utf8")).toBe("keep me");
	});

	it("never writes through a symlink", () => {
		const d = dir();
		const victim = join(d, "victim");
		writeFileSync(victim, "important");
		symlinkSync(victim, join(d, "f"));
		expect(() => createPrivateFile(join(d, "f"), "A=1\n")).toThrow(/EEXIST/);
		expect(readFileSync(victim, "utf8")).toBe("important");
	});

	it("removes the file it created when the write fails, so no plaintext is left", () => {
		const path = join(dir(), "f");
		expect(() =>
			createPrivateFile(path, "A=1\n", () => {
				throw new Error("ENOSPC");
			})
		).toThrow("ENOSPC");
		expect(existsSync(path)).toBe(false);
	});

	it("throws when the directory is not there, leaving nothing behind", () => {
		const path = join(dir(), "missing", "f");
		expect(() => createPrivateFile(path, "A=1\n")).toThrow(/ENOENT/);
		expect(existsSync(path)).toBe(false);
	});
});
