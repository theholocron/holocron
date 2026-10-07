import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "./errors.js";
import { isFile, loadFile } from "./utils.js";

describe("loadFile", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "datapad-utils-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("parses a .json file", async () => {
		const filepath = join(dir, "app.config.json");
		await writeFile(filepath, JSON.stringify({ name: "j" }));
		expect(await loadFile<{ name: string }>(filepath, "json")).toEqual({ name: "j" });
	});

	it("throws ConfigFileError with the filepath on malformed JSON", async () => {
		const filepath = join(dir, "app.config.json");
		await writeFile(filepath, "{ not json");
		const err = await loadFile(filepath, "json").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/not valid JSON/);
		expect((err as ConfigFileError).filepath).toBe(filepath);
	});

	it("loads a .js file via dynamic import and unwraps the default export", async () => {
		const filepath = join(dir, "app.config.js");
		await writeFile(filepath, `export default { name: "js" };`);
		expect(await loadFile<{ name: string }>(filepath, "js")).toEqual({ name: "js" });
	});

	it("unwraps the __esModule double-wrap a CJS transform produces", async () => {
		const filepath = join(dir, "app.config.cjs");
		await writeFile(filepath, `module.exports = { __esModule: true, default: { name: "esm" } };`);
		expect(await loadFile<{ name: string }>(filepath, "cjs")).toEqual({ name: "esm" });
	});

	it("throws ConfigFileError when a module has no default export", async () => {
		const filepath = join(dir, "app.config.js");
		await writeFile(filepath, `export const x = 1;`);
		const err = await loadFile(filepath, "js").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/default export/);
	});

	it("wraps a module-level throw as ConfigFileError", async () => {
		const filepath = join(dir, "app.config.js");
		await writeFile(filepath, `throw new Error("boom");`);
		const err = await loadFile(filepath, "js").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/could not load/);
	});

	it("loads a .ts file via tsx's registered loader", async () => {
		const filepath = join(dir, "app.config.ts");
		await writeFile(filepath, `export default { name: "ts" } as const;`);
		expect(await loadFile<{ name: string }>(filepath, "ts")).toEqual({ name: "ts" });
	});

	it("reuses the already-registered tsx loader across repeated .ts loads", async () => {
		const first = join(dir, "first.config.ts");
		const second = join(dir, "second.config.ts");
		await writeFile(first, `export default { name: "first" } as const;`);
		await writeFile(second, `export default { name: "second" } as const;`);
		expect(await loadFile<{ name: string }>(first, "ts")).toEqual({ name: "first" });
		expect(await loadFile<{ name: string }>(second, "ts")).toEqual({ name: "second" });
	});

	it("wraps a throwing .ts file as ConfigFileError", async () => {
		const filepath = join(dir, "app.config.ts");
		await writeFile(filepath, `throw new Error("boom from ts");`);
		const err = await loadFile(filepath, "ts").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/could not load/);
	});
});

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
