import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defineConfig } from "../define/index.js";
import { loadTasksConfig } from "./load.js";

describe("defineConfig", () => {
	it("is an identity passthrough", () => {
		const cfg = { tasks: ["lint", { name: "test", required: true }] };
		expect(defineConfig(cfg)).toBe(cfg);
	});
});

describe("loadTasksConfig", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "astromech-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("returns {} when neither astromech.config.* nor holocron.config tasks exist", async () => {
		expect(await loadTasksConfig(cwd)).toEqual({});
	});

	it("reads a dedicated astromech.config.json", async () => {
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ tasks: ["lint", "test"] }));
		expect(await loadTasksConfig(cwd)).toEqual({ tasks: ["lint", "test"] });
	});

	it("reads the bare item array from the tasks key of holocron.config.json", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "x", tasks: ["typecheck"], providers: {} })
		);
		expect(await loadTasksConfig(cwd)).toEqual({ tasks: ["typecheck"] });
	});

	it("merges the dedicated file over the holocron.config tasks key, arrays concatenating", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ tasks: ["a"] }));
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ tasks: ["b"], syncScripts: false }));
		expect(await loadTasksConfig(cwd)).toEqual({ tasks: ["a", "b"], syncScripts: false });
	});

	it("uses an already-loaded holocron.config without reading it again", async () => {
		// Malformed on purpose: loading it would throw, so a read can't go unnoticed.
		await writeFile(join(cwd, "holocron.config.json"), "{ not json");
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ tasks: ["dedicated"] }));
		const holocron = { config: { tasks: ["preloaded"] }, filepath: join(cwd, "holocron.config.json") };
		expect(await loadTasksConfig(cwd, { holocron })).toEqual({ tasks: ["preloaded", "dedicated"] });
	});

	it("treats holocron: null as no holocron.config, without reading one", async () => {
		await writeFile(join(cwd, "holocron.config.json"), "{ not json");
		expect(await loadTasksConfig(cwd, { holocron: null })).toEqual({});
	});

	it("reads holocron.config itself when none is passed (the control for the tests above)", async () => {
		await writeFile(join(cwd, "holocron.config.json"), "{ not json");
		await expect(loadTasksConfig(cwd)).rejects.toThrow(/not valid JSON/);
	});
});
