import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defaultListDirs } from "./default-list-dirs.js";

describe("defaultListDirs", () => {
	const dirs: string[] = [];
	const tmp = () => {
		const dir = mkdtempSync(join(tmpdir(), "deploy-on-release-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("defaultListDirs lists only the folders", () => {
		const dir = tmp();
		mkdirSync(join(dir, "a"));
		mkdirSync(join(dir, "b"));
		writeFileSync(join(dir, "file.txt"), "");
		expect(defaultListDirs(dir).sort()).toEqual(["a", "b"]);
	});
});
