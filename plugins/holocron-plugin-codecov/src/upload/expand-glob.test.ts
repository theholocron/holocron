import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { expandGlob } from "./expand-glob.js";

describe("expandGlob", () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "glob-test-"));
		for (const file of [
			"utils/b-utils/coverage/lcov.info",
			"utils/a-utils/coverage/lcov.info",
			"utils/a-utils/other.txt",
			"utils/a-utils/.hidden/lcov.info",
			"lcov.info",
			"a.b+c/x(1).info",
			"deep/one/two/lcov.info",
			"deep/lcov.info",
			".dot/lcov.info",
		]) {
			mkdirSync(join(dir, file, ".."), { recursive: true });
			writeFileSync(join(dir, file), "");
		}
		mkdirSync(join(dir, "empty-dir"));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it("returns the matches relative to the folder, sorted", () => {
		expect(expandGlob("utils/*/coverage/lcov.info", dir)).toEqual([
			"utils/a-utils/coverage/lcov.info",
			"utils/b-utils/coverage/lcov.info",
		]);
	});

	it("returns nothing when nothing matches, or the folder does not exist", () => {
		expect(expandGlob("nope/*/lcov.info", dir)).toEqual([]);
		expect(expandGlob("utils/*/missing.info", dir)).toEqual([]);
		expect(expandGlob("lcov.info", join(dir, "not-there"))).toEqual([]);
	});

	it("takes a literal path, with or without a leading ./", () => {
		expect(expandGlob("lcov.info", dir)).toEqual(["lcov.info"]);
		expect(expandGlob("./lcov.info", dir)).toEqual(["lcov.info"]);
		expect(expandGlob("utils//a-utils/other.txt", dir)).toEqual(["utils/a-utils/other.txt"]);
	});

	it("does not take a file for a folder", () => {
		expect(expandGlob("lcov.info/x", dir)).toEqual([]);
		expect(expandGlob("lcov.info/*", dir)).toEqual([]);
	});

	it("reads ? as one character and * as any run, within one segment", () => {
		expect(expandGlob("utils/??-utils/other.txt", dir)).toEqual([]);
		expect(expandGlob("utils/?-utils/other.txt", dir)).toEqual(["utils/a-utils/other.txt"]);
		expect(expandGlob("utils/a-utils/o?her.t*", dir)).toEqual(["utils/a-utils/other.txt"]);
		expect(expandGlob("utils/*/coverage/lcov.*", dir)).toHaveLength(2);
	});

	it("treats regular expression characters in a name as themselves", () => {
		expect(expandGlob("a.b+c/x(1).*", dir)).toEqual(["a.b+c/x(1).info"]);
		expect(expandGlob("a.b+c/x(1).info", dir)).toEqual(["a.b+c/x(1).info"]);
	});

	it("lets a wildcard skip names that start with a dot, unless the segment does too", () => {
		expect(expandGlob("*/lcov.info", dir).sort()).toEqual(["deep/lcov.info"]);
		expect(expandGlob(".d*/lcov.info", dir)).toEqual([".dot/lcov.info"]);
		expect(expandGlob("utils/a-utils/*/lcov.info", dir)).toEqual(["utils/a-utils/coverage/lcov.info"]);
		expect(expandGlob("utils/a-utils/.h*/lcov.info", dir)).toEqual(["utils/a-utils/.hidden/lcov.info"]);
	});

	it("lets ** cross folders, including none, and skips dot folders and empty ones", () => {
		expect(expandGlob("deep/**/lcov.info", dir)).toEqual(["deep/lcov.info", "deep/one/two/lcov.info"]);
		expect(expandGlob("**/lcov.info", dir)).toEqual(
			["deep/lcov.info", "deep/one/two/lcov.info", "lcov.info"].concat([
				"utils/a-utils/coverage/lcov.info",
				"utils/b-utils/coverage/lcov.info",
			])
		);
	});

	it("matches a folder when the pattern ends at it, and an empty pattern matches nothing", () => {
		expect(expandGlob("utils/*", dir)).toEqual(["utils/a-utils", "utils/b-utils"]);
		expect(expandGlob("", dir)).toEqual([]);
	});
});
