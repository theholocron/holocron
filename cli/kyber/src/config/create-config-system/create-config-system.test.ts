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

interface Layered extends Raw {
	layout?: unknown;
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

	describe("areas and place", () => {
		const withAreas = (seen: unknown[] = []) =>
			createConfigSystem<Layered, Layered, Frag, Composed>({
				name: "demo",
				areas: ["layout"],
				place: (areas, raw) => {
					seen.push(areas.map((a) => a.area));
					const layout = areas.find((a) => a.area === "layout");
					return layout ? { ...raw, layout: layout.value } : raw;
				},
				derive: ({ config }) => ({ ...config, name: `derived:${JSON.stringify(config.layout ?? null)}` }),
				resolve: (raw) => raw,
				merge: { tags: union<string>() },
			});

		it("loads .demo/<area> beside the config and places it before derive", async () => {
			await writeFile(join(cwd, "demo.config.json"), "{}");
			await mkdir(join(cwd, ".demo"));
			await writeFile(join(cwd, ".demo", "layout.json"), JSON.stringify({ a: 1 }));
			const { resolved } = await withAreas().loadConfig(cwd);
			expect(resolved).toEqual({ layout: { a: 1 }, name: 'derived:{"a":1}' });
		});

		it("calls place with no areas when the directory is missing", async () => {
			await writeFile(join(cwd, "demo.config.json"), "{}");
			const seen: unknown[] = [];
			await withAreas(seen).loadConfig(cwd);
			expect(seen).toEqual([[]]);
		});

		it("reads the directory next to the config found by walking up", async () => {
			execSync("git init -q", { cwd });
			await writeFile(join(cwd, "demo.config.json"), "{}");
			await mkdir(join(cwd, ".demo"));
			await writeFile(join(cwd, ".demo", "layout.json"), JSON.stringify({ up: true }));
			await mkdir(join(cwd, "a"));
			const { resolved } = await withAreas().loadConfig(join(cwd, "a"));
			expect(resolved.layout).toEqual({ up: true });
		});

		it("propagates a ConfigFileError from an area file that fails to load", async () => {
			await writeFile(join(cwd, "demo.config.json"), "{}");
			await mkdir(join(cwd, ".demo"));
			await writeFile(join(cwd, ".demo", "layout.json"), "{ nope");
			await expect(withAreas().loadConfig(cwd)).rejects.toMatchObject({ name: "ConfigFileError" });
		});

		it("hands a config in a subdirectory the shared areas of the repository root too", async () => {
			execSync("git init -q", { cwd });
			await mkdir(join(cwd, ".demo"));
			await writeFile(join(cwd, ".demo", "layout.json"), JSON.stringify({ from: "root" }));
			await writeFile(join(cwd, ".demo", "other.json"), JSON.stringify({ from: "root" }));
			const app = join(cwd, "apps", "a");
			await mkdir(app, { recursive: true });
			await writeFile(join(app, "demo.config.json"), "{}");
			const seen: { area: string; path: string }[][] = [];
			const system = createConfigSystem<Layered, Layered, Frag, Composed>({
				name: "demo",
				areas: ["layout", "other"],
				shared: ["layout"],
				place: (areas, raw) => {
					seen.push(areas.map(({ area, path }) => ({ area, path })));
					return raw;
				},
				resolve: (raw) => raw,
				merge: { tags: union<string>() },
			});
			await system.loadConfig(app);
			expect(seen).toEqual([[{ area: "layout", path: "../../.demo/layout.json" }]]);
		});

		it("does not touch the directory when no place is given", async () => {
			await writeFile(join(cwd, "demo.config.json"), JSON.stringify({ name: "hi" }));
			await mkdir(join(cwd, ".demo"));
			await writeFile(join(cwd, ".demo", "layout.json"), "{ nope");
			const system = createConfigSystem<Raw, Resolved, Frag, Composed>({
				name: "demo",
				areas: ["layout"],
				resolve: (raw) => ({ name: raw.name ?? "none" }),
				merge: { tags: union<string>() },
			});
			expect((await system.loadConfig(cwd)).resolved).toEqual({ name: "hi" });
		});
	});

	it("composes fragments with the given strategies", () => {
		expect(plain.compose({ id: "a", tags: ["x"] }, [{ id: "b", tags: ["y"] }])).toEqual({ tags: ["x", "y"] });
	});
});
