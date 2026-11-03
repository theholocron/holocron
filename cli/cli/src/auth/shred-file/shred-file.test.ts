import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shredFile } from "./shred-file.js";

const dir = () => mkdtempSync(join(tmpdir(), "holocron-shred-"));
const identityOf = (path: string) => {
	const { dev, ino } = statSync(path);
	return { dev, ino };
};

describe("shredFile", () => {
	it("overwrites the contents with zeros, then removes the file", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET=value\n");
		let seen: string | undefined;
		const outcome = shredFile(path, identityOf(path), (p) => {
			seen = readFileSync(p).toString("latin1");
			unlinkSync(p);
		});
		expect(outcome).toBe("deleted");
		expect(seen).toBe("\0".repeat("SECRET=value\n".length));
		expect(existsSync(path)).toBe(false);
	});

	it("is missing, not an error, when the file is already gone", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "x");
		const identity = identityOf(path);
		unlinkSync(path);
		expect(shredFile(path, identity)).toBe("missing");
	});

	it("leaves a different file at the same path alone", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "first");
		const first = identityOf(path);
		unlinkSync(path);
		writeFileSync(path, "someone else's");
		expect(shredFile(path, first)).toBe("replaced");
		expect(readFileSync(path, "utf8")).toBe("someone else's");
	});

	it("does not follow a symlink put in its place, so the target is never zeroed", () => {
		const d = dir();
		const path = join(d, ".credentials");
		const victim = join(d, "victim");
		writeFileSync(path, "mine");
		const mine = identityOf(path);
		writeFileSync(victim, "important");
		unlinkSync(path);
		symlinkSync(victim, path);
		expect(shredFile(path, mine)).toBe("replaced");
		expect(readFileSync(victim, "utf8")).toBe("important");
	});

	it("still removes a file it cannot overwrite", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET");
		chmodSync(path, 0o400);
		expect(shredFile(path, identityOf(path))).toBe("deleted");
		expect(existsSync(path)).toBe(false);
	});

	it("throws, rather than say it deleted the file, when it cannot be removed", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET");
		expect(() =>
			shredFile(path, identityOf(path), () => {
				throw new Error("EPERM");
			})
		).toThrow("EPERM");
		expect(existsSync(path)).toBe(true);
	});

	it("throws on a path it cannot even inspect", () => {
		const path = join(dir(), "file", "child");
		writeFileSync(join(path, ".."), "a file where a directory would be");
		expect(() => shredFile(path, { dev: 0, ino: 0 })).toThrow();
	});
});
