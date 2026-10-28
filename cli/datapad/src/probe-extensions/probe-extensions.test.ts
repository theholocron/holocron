import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import { probeExtensions } from "./probe-extensions.js";

describe("probeExtensions", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "datapad-probe-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("returns undefined when no <name>.config.<ext> exists for any given extension", async () => {
		expect(await probeExtensions(dir, "app", ["json", "js"])).toBeUndefined();
	});

	it("returns the first match in the given extension order, not DEFAULT_EXTENSIONS' order", async () => {
		await writeFile(join(dir, "app.config.ts"), `export default { name: "ts" } as const;`);
		await writeFile(join(dir, "app.config.json"), JSON.stringify({ name: "json" }));
		const found = await probeExtensions<{ name: string }>(dir, "app", ["json", "ts"]);
		expect(found?.config).toEqual({ name: "json" });
		expect(found?.filepath).toBe(join(dir, "app.config.json"));
	});

	it("skips extensions with no matching file and returns the first one that does", async () => {
		await writeFile(join(dir, "app.config.js"), `export default { name: "js" };`);
		const found = await probeExtensions<{ name: string }>(dir, "app", ["json", "js"]);
		expect(found?.config).toEqual({ name: "js" });
	});

	it("propagates a ConfigFileError from the underlying load", async () => {
		await writeFile(join(dir, "app.config.json"), "{ not json");
		const err = await probeExtensions(dir, "app", ["json"]).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
	});
});
