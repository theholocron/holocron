import { execSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { union } from "../union/index.js";
import { createConfigSystem } from "./create-config-system.js";

interface Raw {
	name?: string;
}
interface Resolved {
	name: string;
}
interface Frag {
	id: string;
	tags?: string[];
}
interface Composed {
	tags: string[];
}

describe("createConfigSystem", () => {
	let cwd: string;
	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "kyber-cfg-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	const plain = createConfigSystem<Raw, Resolved, Frag, Composed>({
		name: "demo",
		resolve: (raw) => ({ name: raw.name ?? "none" }),
		merge: { tags: union<string>() },
	});
	const derived = createConfigSystem<Raw, Resolved, Frag, Composed>({
		name: "demo",
		derive: async ({ config, filepath }) => ({ ...config, name: config.name ?? filepath }),
		resolve: (raw) => ({ name: raw.name! }),
		merge: { tags: union<string>() },
	});

	it("defineConfig returns its input", () => {
		const cfg = { name: "x" };
		expect(plain.defineConfig(cfg)).toBe(cfg);
	});

	it("loads and resolves the config file", async () => {
		await writeFile(join(cwd, "demo.config.json"), JSON.stringify({ name: "hi" }));
		expect(await plain.loadConfig(cwd)).toEqual({
			resolved: { name: "hi" },
			filepath: join(cwd, "demo.config.json"),
		});
	});

	it("runs derive between load and resolve", async () => {
		await writeFile(join(cwd, "demo.config.json"), "{}");
		const { resolved } = await derived.loadConfig(cwd);
		expect(resolved.name).toBe(join(cwd, "demo.config.json"));
	});

	it("walks up to the repo root", async () => {
		execSync("git init -q", { cwd });
		await writeFile(join(cwd, "demo.config.json"), JSON.stringify({ name: "up" }));
		await mkdir(join(cwd, "a", "b"), { recursive: true });
		expect((await plain.loadConfig(join(cwd, "a", "b"))).resolved.name).toBe("up");
	});

	it("throws ConfigFileError naming the file when none is found", async () => {
		execSync("git init -q", { cwd });
		await expect(plain.loadConfig(cwd)).rejects.toMatchObject({
			name: "ConfigFileError",
			message: expect.stringContaining("no demo.config.{ts,js,mjs,cjs,json} found"),
		});
	});

	it("composes fragments with the given strategies", () => {
		expect(plain.compose({ id: "a", tags: ["x"] }, [{ id: "b", tags: ["y"] }])).toEqual({ tags: ["x", "y"] });
	});
});
