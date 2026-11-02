import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DOTENV_FILE, readDotenvFile } from "./dotenv-file.js";

const tmp = () => mkdtempSync(join(tmpdir(), "holocron-dotenv-"));

describe("readDotenvFile", () => {
	it("reads the file at the repo root", () => {
		const root = tmp();
		writeFileSync(join(root, DOTENV_FILE), 'A=1\n# a comment\nB="two words"\n');
		expect(readDotenvFile(root)).toEqual({ A: "1", B: "two words" });
	});

	it("is null when there is no file", () => {
		expect(readDotenvFile(tmp())).toBeNull();
	});

	it("is null when the root is not a directory that exists", () => {
		expect(readDotenvFile(join(tmp(), "missing"))).toBeNull();
	});

	it("does not look in a subdirectory", () => {
		const root = tmp();
		mkdirSync(join(root, "sub"));
		writeFileSync(join(root, "sub", DOTENV_FILE), "A=1\n");
		expect(readDotenvFile(root)).toBeNull();
	});
});
