import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import { loadConfigFile } from "./load-config-file.js";

describe("loadConfigFile", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "datapad-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	it("returns null when no <name>.config.* exists", async () => {
		expect(await loadConfigFile({ cwd, name: "holocron" })).toBeNull();
	});

	it("loads a .json config", async () => {
		await writeFile(join(cwd, "app.config.json"), JSON.stringify({ name: "j" }));
		const found = await loadConfigFile<{ name: string }>({ cwd, name: "app" });
		expect(found?.config).toEqual({ name: "j" });
		expect(found?.filepath).toBe(join(cwd, "app.config.json"));
	});

	it("loads a .js config via its default export", async () => {
		await writeFile(join(cwd, "app.config.js"), `export default { name: "js" };`);
		expect((await loadConfigFile<{ name: string }>({ cwd, name: "app" }))?.config).toEqual({ name: "js" });
	});

	it("loads an .mjs config", async () => {
		await writeFile(join(cwd, "app.config.mjs"), `export default { name: "mjs" };`);
		expect((await loadConfigFile<{ name: string }>({ cwd, name: "app" }))?.config).toEqual({ name: "mjs" });
	});

	it("loads a .cjs config", async () => {
		await writeFile(join(cwd, "app.config.cjs"), `module.exports = { name: "cjs" };`);
		expect((await loadConfigFile<{ name: string }>({ cwd, name: "app" }))?.config).toEqual({ name: "cjs" });
	});

	it("unwraps the __esModule double-wrap a CJS transform produces", async () => {
		await writeFile(
			join(cwd, "app.config.cjs"),
			`module.exports = { __esModule: true, default: { name: "esm" } };`
		);
		expect((await loadConfigFile<{ name: string }>({ cwd, name: "app" }))?.config).toEqual({ name: "esm" });
	});

	it("loads a .ts config via tsx", async () => {
		await writeFile(join(cwd, "app.config.ts"), `export default { name: "ts" } as const;`);
		expect((await loadConfigFile<{ name: string }>({ cwd, name: "app" }))?.config).toEqual({ name: "ts" });
	});

	it("probes TS-first: .ts wins over .json", async () => {
		await writeFile(join(cwd, "app.config.json"), JSON.stringify({ name: "json" }));
		await writeFile(join(cwd, "app.config.ts"), `export default { name: "ts" } as const;`);
		expect((await loadConfigFile<{ name: string }>({ cwd, name: "app" }))?.config).toEqual({ name: "ts" });
	});

	it("honours a custom extension order", async () => {
		await writeFile(join(cwd, "app.config.json"), JSON.stringify({ name: "json" }));
		await writeFile(join(cwd, "app.config.js"), `export default { name: "js" };`);
		const found = await loadConfigFile<{ name: string }>({ cwd, name: "app", extensions: ["json", "js"] });
		expect(found?.config).toEqual({ name: "json" });
	});

	it("throws ConfigFileError on malformed JSON", async () => {
		await writeFile(join(cwd, "app.config.json"), "{ not json");
		const err = await loadConfigFile({ cwd, name: "app" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/not valid JSON/);
		expect((err as ConfigFileError).filepath).toBe(join(cwd, "app.config.json"));
	});

	it("throws ConfigFileError when a .js config has no default export", async () => {
		await writeFile(join(cwd, "app.config.js"), `export const x = 1;`);
		const err = await loadConfigFile({ cwd, name: "app" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/default export/);
	});

	it("throws ConfigFileError when a .ts config has no default export", async () => {
		await writeFile(join(cwd, "app.config.ts"), `export const x: number = 1;`);
		const err = await loadConfigFile({ cwd, name: "app" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
	});

	it("wraps a syntax error in a .js config as ConfigFileError", async () => {
		await writeFile(join(cwd, "app.config.js"), `export default { : bad`);
		const err = await loadConfigFile({ cwd, name: "app" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/could not load/);
	});

	it("wraps a throwing .ts config as ConfigFileError", async () => {
		await writeFile(join(cwd, "app.config.ts"), `throw new Error("boom from config");`);
		const err = await loadConfigFile({ cwd, name: "app" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/could not load/);
	});

	it("stringifies a non-Error throw in the failure message", async () => {
		await writeFile(join(cwd, "app.config.ts"), `throw "plain string boom";`);
		const err = await loadConfigFile({ cwd, name: "app" }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/plain string boom/);
	});
});

describe("loadConfigFile — walkUp", () => {
	let root: string;
	let nested: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "datapad-walkup-"));
		nested = join(root, "a", "b");
		await mkdir(nested, { recursive: true });
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("does not search ancestor directories by default", async () => {
		await writeFile(join(root, "app.config.json"), JSON.stringify({ name: "root" }));
		expect(await loadConfigFile({ cwd: nested, name: "app" })).toBeNull();
	});

	it("walks up to find a config in an ancestor directory when walkUp is set", async () => {
		await writeFile(join(root, "app.config.json"), JSON.stringify({ name: "root" }));
		const found = await loadConfigFile<{ name: string }>({ cwd: nested, name: "app", walkUp: true });
		expect(found?.config).toEqual({ name: "root" });
		expect(found?.filepath).toBe(join(root, "app.config.json"));
	});

	it("stops at the first ancestor containing a .git entry, without searching further", async () => {
		await mkdir(join(root, "a", ".git"));
		await writeFile(join(root, "app.config.json"), JSON.stringify({ name: "root" }));
		expect(await loadConfigFile({ cwd: nested, name: "app", walkUp: true })).toBeNull();
	});

	it("still searches the directory containing .git before stopping there", async () => {
		await mkdir(join(root, "a", ".git"));
		await writeFile(join(root, "a", "app.config.json"), JSON.stringify({ name: "a" }));
		const found = await loadConfigFile<{ name: string }>({ cwd: nested, name: "app", walkUp: true });
		expect(found?.config).toEqual({ name: "a" });
	});

	it("treats a .git file (worktree/submodule pointer) the same as a .git directory", async () => {
		await writeFile(join(root, "a", ".git"), "gitdir: /elsewhere\n");
		await writeFile(join(root, "app.config.json"), JSON.stringify({ name: "root" }));
		expect(await loadConfigFile({ cwd: nested, name: "app", walkUp: true })).toBeNull();
	});
});
