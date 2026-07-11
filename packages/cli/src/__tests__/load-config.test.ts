import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigError } from "../config.js";
import { ConfigFileError, loadConfig } from "../load-config.js";

describe("loadConfig", () => {
	let cwd: string;

	beforeEach(async () => {
		cwd = await mkdtemp(join(tmpdir(), "holocron-cfg-"));
	});
	afterEach(async () => {
		await rm(cwd, { recursive: true, force: true });
	});

	// ── JSON ──────────────────────────────────────────────────────────────

	it("reads + resolves a valid holocron.config.json", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({
				project: { name: "demo" },
				providers: { vault: "1password", source: "github" },
			})
		);
		const { resolved, filepath } = await loadConfig(cwd);
		expect(filepath).toBe(join(cwd, "holocron.config.json"));
		expect(resolved.project.name).toBe("demo");
		expect(resolved.providers.vault?.cardinality).toBe("single");
	});

	it("errors clearly when no holocron.config.* exists in the directory", async () => {
		await expect(loadConfig(cwd)).rejects.toBeInstanceOf(ConfigFileError);
		await expect(loadConfig(cwd)).rejects.toThrow(/no holocron\.config/);
	});

	it("errors with a clear message when the JSON is malformed", async () => {
		await writeFile(join(cwd, "holocron.config.json"), "{ not valid json");
		await expect(loadConfig(cwd)).rejects.toBeInstanceOf(ConfigError);
		await expect(loadConfig(cwd)).rejects.toThrow(/not valid JSON/);
	});

	it("loads valid config without vault (vault is no longer required)", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ project: { name: "demo" }, providers: { source: "github" } })
		);
		const result = await loadConfig(cwd);
		expect(result.resolved.project.name).toBe("demo");
		expect(result.resolved.providers.vault).toBeUndefined();
	});

	// ── JS ────────────────────────────────────────────────────────────────

	it("reads + resolves a valid holocron.config.js", async () => {
		await writeFile(
			join(cwd, "holocron.config.js"),
			`export default { project: { name: "js-demo" }, providers: { source: "github" } };`
		);
		const { resolved, filepath } = await loadConfig(cwd);
		expect(filepath).toBe(join(cwd, "holocron.config.js"));
		expect(resolved.project.name).toBe("js-demo");
	});

	it("errors when holocron.config.js has no default export", async () => {
		await writeFile(join(cwd, "holocron.config.js"), `export const x = 1;`);
		try {
			await loadConfig(cwd);
			expect.fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			expect((err as Error).message).toMatch(/default export/);
		}
	});

	it("errors when the JS config is invalid (missing project.name)", async () => {
		await writeFile(join(cwd, "holocron.config.js"), `export default { project: {}, providers: {} };`);
		try {
			await loadConfig(cwd);
			expect.fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigError);
		}
	});

	// ── TS ────────────────────────────────────────────────────────────────

	it("reads + resolves a valid holocron.config.ts (via tsImport)", async () => {
		await writeFile(
			join(cwd, "holocron.config.ts"),
			`export default { project: { name: "ts-demo" }, providers: { source: "github" } } as const;`
		);
		const { resolved, filepath } = await loadConfig(cwd);
		expect(filepath).toBe(join(cwd, "holocron.config.ts"));
		expect(resolved.project.name).toBe("ts-demo");
	});

	it("errors when holocron.config.ts has no default export", async () => {
		await writeFile(join(cwd, "holocron.config.ts"), `export const x: number = 1;`);
		try {
			await loadConfig(cwd);
			expect.fail("should have thrown");
		} catch (err) {
			expect(err).toBeInstanceOf(ConfigFileError);
			expect((err as Error).message).toMatch(/default export/);
		}
	});

	// ── Priority ──────────────────────────────────────────────────────────

	it("prefers .json over .js when both exist", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ project: { name: "json-wins" }, providers: {} })
		);
		await writeFile(
			join(cwd, "holocron.config.js"),
			`export default { project: { name: "js-loses" }, providers: {} };`
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.project.name).toBe("json-wins");
	});

	it("prefers .js over .ts when both exist (no .json)", async () => {
		await writeFile(
			join(cwd, "holocron.config.js"),
			`export default { project: { name: "js-wins" }, providers: { source: "github" } };`
		);
		await writeFile(
			join(cwd, "holocron.config.ts"),
			`export default { project: { name: "ts-loses" }, providers: { source: "github" } } as const;`
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.project.name).toBe("js-wins");
	});
});
