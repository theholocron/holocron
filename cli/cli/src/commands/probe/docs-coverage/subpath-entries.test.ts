import { describe, expect, it } from "vitest";

import { subpathEntries } from "./subpath-entries.js";

const has =
	(...paths: string[]) =>
	(path: string) =>
		paths.includes(path);

describe("subpathEntries", () => {
	it("finds the source of each subpath, whether the package keeps it in src/ or at its root", () => {
		const exports = {
			".": { import: "./dist/index.mjs" },
			"./config": { types: "./dist/config/index.d.mts", import: "./dist/config/index.mjs" },
			"./testing": "./dist/testing.mjs",
			"./bundles/library": { default: "./dist/bundles/library.js" },
		};

		const found = subpathEntries(
			"/p",
			exports,
			has("/p/src/config/index.ts", "/p/src/testing.ts", "/p/bundles/library.ts")
		);

		expect(found).toEqual(["/p/src/config/index.ts", "/p/src/testing.ts", "/p/bundles/library.ts"]);
	});

	it("tries a folder's index when the file is not there, and prefers src/ to the root", () => {
		expect(subpathEntries("/p", { "./a": "./dist/a.mjs" }, has("/p/src/a/index.ts"))).toEqual([
			"/p/src/a/index.ts",
		]);
		expect(subpathEntries("/p", { "./a": "./dist/a.mjs" }, has("/p/src/a.ts", "/p/a.ts"))).toEqual(["/p/src/a.ts"]);
		expect(subpathEntries("/p", { "./a": "./dist/a.mjs" }, has("/p/a/index.ts"))).toEqual(["/p/a/index.ts"]);
	});

	it("takes a TypeScript target as it is, and reads the conditions in order", () => {
		expect(subpathEntries("/p", { "./x": "./src/x.ts" }, has("/p/src/x.ts"))).toEqual(["/p/src/x.ts"]);
		expect(
			subpathEntries("/p", { "./y": { require: "./dist/y.cjs", types: "./dist/y.d.ts" } }, has("/p/src/y.ts"))
		).toEqual(["/p/src/y.ts"]);
	});

	it("leaves out the root, package.json, patterns, declarations, JSON, and a subpath with no source", () => {
		const exports = {
			".": "./dist/index.mjs",
			"./package.json": "./package.json",
			"./*": "./dist/*.mjs",
			"./client": "./client.d.ts",
			"./astro": "./astro/tsconfig.json",
			"./gone": "./dist/gone.mjs",
			"./nothing": { other: "./dist/other.mjs" },
			"./empty": {},
		};

		expect(subpathEntries("/p", exports, () => false)).toEqual([]);
		expect(subpathEntries("/p", exports, has("/p/src/gone.ts"))).toEqual(["/p/src/gone.ts"]);
	});

	it("lists a source once when two subpaths share it", () => {
		const exports = { "./a": "./dist/shared.mjs", "./b": "./dist/shared.mjs" };

		expect(subpathEntries("/p", exports, has("/p/src/shared.ts"))).toEqual(["/p/src/shared.ts"]);
	});

	it("has no subpaths in a package whose exports are missing, a string, or conditions only", () => {
		expect(subpathEntries("/p", undefined, () => true)).toEqual([]);
		expect(subpathEntries("/p", "./dist/index.mjs", () => true)).toEqual([]);
		expect(subpathEntries("/p", { import: "./dist/index.mjs" }, () => true)).toEqual([]);
	});
});
