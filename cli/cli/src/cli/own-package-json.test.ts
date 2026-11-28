import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ownPackageJson } from "./own-package-json.js";

let dir: string;

beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "own-package-json-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("ownPackageJson", () => {
	it("reads the nearest package.json above the module, from a source folder or a build folder alike", () => {
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@x/cli", version: "1.2.3" }));
		mkdirSync(join(dir, "src", "cli"), { recursive: true });
		mkdirSync(join(dir, "dist"));
		expect(ownPackageJson(pathToFileURL(join(dir, "src", "cli", "cli.ts")).href)).toMatchObject({
			name: "@x/cli",
			version: "1.2.3",
		});
		expect(ownPackageJson(pathToFileURL(join(dir, "dist", "cli.mjs")).href)).toMatchObject({ version: "1.2.3" });
	});

	it("prefers the closest package.json over one further up", () => {
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "outer", version: "1.0.0" }));
		mkdirSync(join(dir, "inner"));
		writeFileSync(join(dir, "inner", "package.json"), JSON.stringify({ name: "inner", version: "2.0.0" }));
		expect(ownPackageJson(pathToFileURL(join(dir, "inner", "cli.mjs")).href).name).toBe("inner");
	});

	it("throws, naming where it looked, when there is no package.json above the module", () => {
		// The temp folder sits under no package.json, so nothing is found on the way up.
		expect(() => ownPackageJson(pathToFileURL(join(dir, "cli.mjs")).href)).toThrow(/no package\.json found above/);
	});
});
