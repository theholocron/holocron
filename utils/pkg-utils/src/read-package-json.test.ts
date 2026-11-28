import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readPackageJson, readPackageJsonSync } from "./read-package-json.ts";

describe("readPackageJson / readPackageJsonSync", () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "pkg-utils-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("reads and parses <dir>/package.json", async () => {
		await writeFile(join(dir, "package.json"), '{"name":"x"}');
		expect(await readPackageJson(dir)).toEqual({ name: "x" });
		expect(readPackageJsonSync(dir)).toEqual({ name: "x" });
	});

	it("returns undefined when the file is missing, unreadable or not an object", async () => {
		expect(await readPackageJson(join(dir, "missing"))).toBeUndefined();
		expect(readPackageJsonSync(join(dir, "missing"))).toBeUndefined();
		await mkdir(join(dir, "package.json"));
		expect(await readPackageJson(dir)).toBeUndefined();
		expect(readPackageJsonSync(dir)).toBeUndefined();
		await rm(join(dir, "package.json"), { recursive: true });
		await writeFile(join(dir, "package.json"), "[]");
		expect(await readPackageJson(dir)).toBeUndefined();
		expect(readPackageJsonSync(dir)).toBeUndefined();
	});

	it("sync: reads through an injected readFile, treating a throw as missing", () => {
		const seen: string[] = [];
		const readFile = (path: string) => {
			seen.push(path);
			return '{"name":"mem"}';
		};
		expect(readPackageJsonSync("/repo", { readFile })).toEqual({ name: "mem" });
		expect(seen).toEqual([join("/repo", "package.json")]);
		expect(
			readPackageJsonSync("/repo", {
				readFile: () => {
					throw new Error("ENOENT");
				},
			})
		).toBeUndefined();
	});
});
