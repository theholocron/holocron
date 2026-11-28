import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { realPromoteIo } from "./real-promote-io.js";

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "promote-io-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("realPromoteIo", () => {
	it("makes the folder, writes the file and never overwrites it", () => {
		const path = join(dir, ".notes", "a.spec.md");
		expect(realPromoteIo.exists(path)).toBe(false);
		realPromoteIo.write(path, "one");
		expect(realPromoteIo.exists(path)).toBe(true);
		expect(readFileSync(path, "utf8")).toBe("one");
		expect(() => realPromoteIo.write(path, "two")).toThrow(/EEXIST/);
		expect(readFileSync(path, "utf8")).toBe("one");
	});
});
