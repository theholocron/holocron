import {
	closeSync,
	existsSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { writeCredentialsFile } from "./credentials-file.js";

const dir = () => mkdtempSync(join(tmpdir(), "holocron-credfile-"));
const failing = () => {
	throw new Error("ENOSPC");
};

describe("writeCredentialsFile", () => {
	it("writes the text to a file only its owner can read, and says which file it is", () => {
		const path = join(dir(), ".credentials");
		const identity = writeCredentialsFile(path, "A=1\n");
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(identity).toMatchObject({ dev: statSync(path).dev, ino: statSync(path).ino });
		closeSync(identity.fd);
	});

	it("will not replace a file that is already there, and leaves it as it was", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "keep me");
		expect(() => writeCredentialsFile(path, "A=1\n")).toThrow(/EEXIST/);
		expect(readFileSync(path, "utf8")).toBe("keep me");
	});

	it("removes the file it created when the write fails, so no plaintext is left", () => {
		const path = join(dir(), ".credentials");
		expect(() => writeCredentialsFile(path, "A=1\n", false, failing)).toThrow("ENOSPC");
		expect(existsSync(path)).toBe(false);
	});

	describe("with force", () => {
		it("replaces the file, leaves it private, and zeroes what the old file held", () => {
			const d = dir();
			const path = join(d, ".credentials");
			writeFileSync(path, "OLD_TOKEN=abc", { mode: 0o644 });
			// A second name keeps the old file's blocks reachable, so the test can see what was left in them.
			const survivor = join(d, "survivor");
			linkSync(path, survivor);
			const identity = writeCredentialsFile(path, "A=1\n", true);
			expect(readFileSync(path, "utf8")).toBe("A=1\n");
			expect(statSync(path).mode & 0o777).toBe(0o600);
			expect(identity).toMatchObject({ ino: statSync(path).ino });
			expect(readFileSync(survivor).toString("latin1")).toBe("\0".repeat("OLD_TOKEN=abc".length));
			closeSync(identity.fd);
		});

		it("leaves no temporary file beside it", () => {
			const d = dir();
			const path = join(d, ".credentials");
			writeFileSync(path, "old");
			closeSync(writeCredentialsFile(path, "A=1\n", true).fd);
			expect(readdirSync(d)).toEqual([".credentials"]);
		});

		it("writes when there was nothing to replace", () => {
			const path = join(dir(), ".credentials");
			closeSync(writeCredentialsFile(path, "A=1\n", true).fd);
			expect(readFileSync(path, "utf8")).toBe("A=1\n");
		});

		it("keeps the old file exactly as it was when the replacement cannot be written", () => {
			const d = dir();
			const path = join(d, ".credentials");
			writeFileSync(path, "OLD_TOKEN=abc");
			expect(() => writeCredentialsFile(path, "A=1\n", true, failing)).toThrow("ENOSPC");
			expect(readFileSync(path, "utf8")).toBe("OLD_TOKEN=abc");
			expect(readdirSync(d)).toEqual([".credentials"]);
		});

		it("keeps what is there, and removes the temporary file, when the replacement cannot be swapped in", () => {
			const d = dir();
			const path = join(d, ".credentials");
			// A file cannot be renamed over a directory, so the swap fails after the replacement was written.
			mkdirSync(path);
			writeFileSync(join(path, "inside"), "old");
			expect(() => writeCredentialsFile(path, "A=1\n", true)).toThrow();
			expect(readFileSync(join(path, "inside"), "utf8")).toBe("old");
			expect(readdirSync(d)).toEqual([".credentials"]);
		});

		it("replaces a symlink without touching what it points to", () => {
			const d = dir();
			const victim = join(d, "victim");
			const path = join(d, ".credentials");
			writeFileSync(victim, "important");
			symlinkSync(victim, path);
			closeSync(writeCredentialsFile(path, "A=1\n", true).fd);
			expect(readFileSync(victim, "utf8")).toBe("important");
			expect(readFileSync(path, "utf8")).toBe("A=1\n");
		});

		it("throws, for a reason other than a missing file, when the path cannot be inspected", () => {
			const d = dir();
			writeFileSync(join(d, "a-file"), "x");
			// "a-file" is a file, so asking for something inside it fails with ENOTDIR, not ENOENT.
			expect(() => writeCredentialsFile(join(d, "a-file", ".credentials"), "A=1\n", true)).toThrow(/ENOTDIR/);
		});
	});
});
