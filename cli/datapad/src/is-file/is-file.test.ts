import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isFile } from "./is-file.js";

describe("isFile", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "datapad-utils-isfile-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("returns true for an existing file", async () => {
		const filepath = join(dir, "exists.txt");
		await writeFile(filepath, "x");
		expect(await isFile(filepath)).toBe(true);
	});

	it("returns false for a path that does not exist", async () => {
		expect(await isFile(join(dir, "missing.txt"))).toBe(false);
	});

	it("returns false for a directory", async () => {
		expect(await isFile(dir)).toBe(false);
	});
});
