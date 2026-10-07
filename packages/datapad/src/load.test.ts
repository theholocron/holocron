import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "./errors.js";
import { loadConfigFile, loadConfigFromContent, loadLayered, probeExtensions } from "./load.js";

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

describe("loadConfigFromContent", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "datapad-content-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("writes content to <dir>/<name>.config.<extension> and loads it", async () => {
		const result = await loadConfigFromContent<{ name: string }>({
			dir,
			content: `export default { name: "from-content" };`,
			name: "app",
			extension: "js",
		});
		expect(result.config).toEqual({ name: "from-content" });
		expect(result.filepath).toBe(join(dir, "app.config.js"));
	});

	it("parses .json content as JSON, not as a module", async () => {
		const result = await loadConfigFromContent<{ name: string }>({
			dir,
			content: JSON.stringify({ name: "json-content" }),
			name: "app",
			extension: "json",
		});
		expect(result.config).toEqual({ name: "json-content" });
	});

	it("loads content that does a real ES module import, not just an object literal", async () => {
		// dir determines what upward node_modules resolution the loaded
		// config sees — this proves loadConfigFromContent's fixture actually
		// executes as a real module (import statement and all), the same as
		// loadConfigFile does for a file discovered on disk. Placed under
		// this package's own tree so node_modules/tsx is reachable.
		const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
		const resolvableDir = await mkdtemp(join(packageRoot, ".test-tmp-"));
		try {
			const result = await loadConfigFromContent<{ name: string; hasTsx: boolean }>({
				dir: resolvableDir,
				content: [
					'import * as tsx from "tsx";',
					'export default { name: "resolved-import", hasTsx: !!tsx };',
					"",
				].join("\n"),
				name: "app",
				extension: "ts",
			});
			expect(result.config).toEqual({ name: "resolved-import", hasTsx: true });
		} finally {
			await rm(resolvableDir, { recursive: true, force: true });
		}
	});

	it("wraps a load failure the same way loadConfigFile does (shared loadFile internals)", async () => {
		const err = await loadConfigFromContent({
			dir,
			content: `throw new Error("boom from content");`,
			name: "app",
			extension: "ts",
		}).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as ConfigFileError).message).toMatch(/could not load/);
	});
});

describe("loadLayered", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "datapad-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	const opts = () => ({ cwd, name: "astromech", fallback: { file: "holocron", key: "tasks" } as const });

	it("returns null when neither the dedicated file nor the fallback key resolves", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ name: "x" }));
		expect(await loadLayered(opts())).toBeNull();
	});

	it("reads the dedicated file when present", async () => {
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ tasks: ["lint"] }));
		const result = await loadLayered<{ tasks: string[] }>(opts());
		expect(result?.config).toEqual({ tasks: ["lint"] });
		expect(result?.filepath).toBe(join(cwd, "astromech.config.json"));
		expect(result?.sources).toEqual([join(cwd, "astromech.config.json")]);
	});

	it("reads the fallback key when there is no dedicated file", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ name: "x", tasks: { list: ["test"] } }));
		const result = await loadLayered<{ list: string[] }>(opts());
		expect(result?.config).toEqual({ list: ["test"] });
		expect(result?.filepath).toBe(join(cwd, "holocron.config.json"));
	});

	it("merges the dedicated file over the fallback key, dedicated winning", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ tasks: { linters: ["eslint"], coverage: true } })
		);
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ linters: ["biome"] }));
		const result = await loadLayered<{ linters: string[]; coverage: boolean }>(opts());
		expect(result?.config).toEqual({ linters: ["eslint", "biome"], coverage: true });
		expect(result?.sources).toEqual([join(cwd, "holocron.config.json"), join(cwd, "astromech.config.json")]);
	});

	it("works with no fallback configured", async () => {
		await writeFile(join(cwd, "astromech.config.json"), JSON.stringify({ tasks: ["build"] }));
		const result = await loadLayered<{ tasks: string[] }>({ cwd, name: "astromech" });
		expect(result?.config).toEqual({ tasks: ["build"] });
	});

	it("passes walkUp through to the fallback lookup", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ tasks: { list: ["test"] } }));
		const nested = join(cwd, "nested");
		await mkdir(nested, { recursive: true });
		const result = await loadLayered<{ list: string[] }>({
			cwd: nested,
			name: "astromech",
			fallback: { file: "holocron", key: "tasks" },
			walkUp: true,
		});
		expect(result?.config).toEqual({ list: ["test"] });
		expect(result?.filepath).toBe(join(cwd, "holocron.config.json"));
	});
});
