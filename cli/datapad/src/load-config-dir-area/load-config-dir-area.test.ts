import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfigDirArea } from "./load-config-dir-area.js";

describe("loadConfigDirArea", () => {
	let root: string;
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "datapad-area-"));
		await mkdir(join(root, "app", ".holocron"), { recursive: true });
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("loads the first matching extension, with a path relative to the base", async () => {
		await writeFile(join(root, "app", ".holocron", "org.json"), '{"a":1}');
		const area = await loadConfigDirArea(join(root, "app"), join(root, "app"), ".holocron", "org");
		expect(area).toEqual({
			area: "org",
			path: ".holocron/org.json",
			extension: "json",
			filepath: join(root, "app", ".holocron", "org.json"),
			value: { a: 1 },
		});
	});

	it("gives a path with ../ when the base is below the directory read", async () => {
		await writeFile(join(root, "app", ".holocron", "org.json"), "{}");
		const area = await loadConfigDirArea(join(root, "app"), join(root, "app", "sub"), ".holocron", "org");
		expect(area?.path).toBe("../.holocron/org.json");
	});

	it("honours the extension order it is given", async () => {
		await writeFile(join(root, "app", ".holocron", "org.json"), '{"a":1}');
		const area = await loadConfigDirArea(join(root, "app"), join(root, "app"), ".holocron", "org", ["mjs"]);
		expect(area).toBeUndefined();
	});

	it("returns undefined when there is no file", async () => {
		expect(await loadConfigDirArea(root, root, ".holocron", "org")).toBeUndefined();
	});
});
