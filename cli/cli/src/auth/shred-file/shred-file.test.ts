import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { shredFile } from "./shred-file.js";

const dir = () => mkdtempSync(join(tmpdir(), "holocron-shred-"));

describe("shredFile", () => {
	it("removes the file", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET=value\n");
		shredFile(path);
		expect(existsSync(path)).toBe(false);
	});

	it("overwrites the contents with zeros before removing it", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "SECRET=value\n");
		let seen: string | undefined;
		shredFile(path, (p) => {
			seen = readFileSync(p).toString("latin1");
			unlinkSync(p);
		});
		expect(seen).toBe("\0".repeat("SECRET=value\n".length));
		expect(existsSync(path)).toBe(false);
	});

	it("is not an error when the file is already gone", () => {
		expect(() => shredFile(join(dir(), "missing"))).not.toThrow();
	});
});
