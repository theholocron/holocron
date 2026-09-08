import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { defineConfig } from "./define.js";
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
		await writeFile(
			join(cwd, "astromech.config.json"),
			JSON.stringify({ tasks: ["b"], syncScripts: false })
		);
		expect(await loadTasksConfig(cwd)).toEqual({ tasks: ["a", "b"], syncScripts: false });
	});
});
