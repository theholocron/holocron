import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "./errors.js";
import { loadConfigFile, loadLayered } from "./load.js";

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
});
