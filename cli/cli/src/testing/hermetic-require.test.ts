import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as nodeModule from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hermeticCreateRequire } from "./hermetic-require.js";

// built at run time: a literal "left-pad/package.json" in a resolve() call reads as an unlisted dependency to knip
const FAKE_PACKAGE = "left-pad";
const FAKE_SPECIFIER = `${FAKE_PACKAGE}/package.json`;

describe("hermeticCreateRequire", () => {
	let dir: string;
	const createRequire = hermeticCreateRequire(nodeModule);

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "hermetic-require-"));
		await writeFile(join(dir, "package.json"), JSON.stringify({ name: "repo" }));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("resolves a package installed under the directory", async () => {
		const pkg = join(dir, "node_modules", "left-pad");
		await mkdir(pkg, { recursive: true });
		await writeFile(
			join(pkg, "package.json"),
			JSON.stringify({ name: "left-pad", exports: { "./package.json": "./package.json" } })
		);

		const require = createRequire(pathToFileURL(join(dir, "package.json")));
		expect(require.resolve(FAKE_SPECIFIER)).toContain(join("node_modules", FAKE_PACKAGE, "package.json"));
	});

	it("accepts a plain path as well as a file URL", async () => {
		const require = createRequire(join(dir, "package.json"));
		expect(() => require.resolve(FAKE_SPECIFIER)).toThrow(/Cannot find module/);
	});

	it("does not find a package that only exists elsewhere on the resolution path", () => {
		// vitest itself is resolvable from this repo, but not from an unrelated temp directory
		const require = createRequire(pathToFileURL(join(dir, "package.json")));
		expect(() => require.resolve("vitest/package.json")).toThrow(/Cannot find module/);
	});

	it("still loads modules with require()", async () => {
		await writeFile(join(dir, "data.json"), JSON.stringify({ ok: true }));
		const require = createRequire(pathToFileURL(join(dir, "package.json")));
		expect(require("./data.json")).toEqual({ ok: true });
	});

	it("fails to resolve when the directory does not exist", () => {
		const require = createRequire(pathToFileURL(join(dir, "missing", "package.json")));
		expect(() => require.resolve(FAKE_SPECIFIER)).toThrow(/Cannot find module/);
	});
});
