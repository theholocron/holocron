import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { writeCredentialsFile } from "./credentials-file.js";

const dir = () => mkdtempSync(join(tmpdir(), "holocron-credfile-"));

describe("writeCredentialsFile", () => {
	it("writes the text to a file only its owner can read", () => {
		const path = join(dir(), ".credentials");
		writeCredentialsFile(path, "A=1\n");
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
		expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	it("will not replace a file that is already there", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "keep me");
		expect(() => writeCredentialsFile(path, "A=1\n")).toThrow(/EEXIST/);
		expect(readFileSync(path, "utf8")).toBe("keep me");
	});

	it("replaces it with force, and still leaves it private", () => {
		const path = join(dir(), ".credentials");
		writeFileSync(path, "old", { mode: 0o644 });
		writeCredentialsFile(path, "A=1\n", true);
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
		expect(statSync(path).mode & 0o777).toBe(0o600);
	});

	it("writes with force when there was nothing to replace", () => {
		const path = join(dir(), ".credentials");
		writeCredentialsFile(path, "A=1\n", true);
		expect(readFileSync(path, "utf8")).toBe("A=1\n");
	});
});
