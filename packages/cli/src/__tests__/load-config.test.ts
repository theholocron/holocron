import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfigError } from "../config.js";
import { ConfigFileError, loadConfig } from "../load-config.js";

// In production, tsx CJS-transforms `export default x` into `exports.default = x`,
// so dynamic import produces { default: { __esModule: true, default: x } }.
// In vitest's module system tsImport adds a further outer { default: ... } wrap,
// so we strip one layer here to match the production double-wrap shape that
// extractAndResolve now handles.
vi.mock("tsx/esm/api", async (importOriginal) => {
	const real = await importOriginal<typeof import("tsx/esm/api")>();
	return {
		...real,
		tsImport: async (...args: Parameters<typeof real.tsImport>) => {
			const result = (await real.tsImport(...args)) as Record<string, unknown>;
			return "default" in result ? (result.default as Record<string, unknown>) : result;
		},
	};
});

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
				name: "demo",
				providers: { vault: "1password", source: "github" },
			})
		);
		const { resolved, filepath } = await loadConfig(cwd);
		expect(filepath).toBe(join(cwd, "holocron.config.json"));
		expect(resolved.name).toBe("demo");
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
			JSON.stringify({ name: "demo", providers: { source: "github" } })
		);
		const result = await loadConfig(cwd);
		expect(result.resolved.name).toBe("demo");
		expect(result.resolved.providers.vault).toBeUndefined();
	});

	// ── JS ────────────────────────────────────────────────────────────────

	it("reads + resolves a valid holocron.config.js", async () => {
		await writeFile(
			join(cwd, "holocron.config.js"),
			`export default { name: "js-demo", providers: { source: "github" } };`
		);
		const { resolved, filepath } = await loadConfig(cwd);
		expect(filepath).toBe(join(cwd, "holocron.config.js"));
		expect(resolved.name).toBe("js-demo");
	});

	it("errors when holocron.config.js has no default export", async () => {
		await writeFile(join(cwd, "holocron.config.js"), `export const x = 1;`);
		const err = await loadConfig(cwd).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as Error).message).toMatch(/default export/);
	});

	it("errors when the JS config is invalid (missing providers)", async () => {
		await writeFile(join(cwd, "holocron.config.js"), `export default { name: "demo" };`);
		const err = await loadConfig(cwd).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigError);
	});

	// ── TS ────────────────────────────────────────────────────────────────

	it("reads + resolves a valid holocron.config.ts (via tsImport)", async () => {
		await writeFile(
			join(cwd, "holocron.config.ts"),
			`export default { name: "ts-demo", providers: { source: "github" } } as const;`
		);
		const { resolved, filepath } = await loadConfig(cwd);
		expect(filepath).toBe(join(cwd, "holocron.config.ts"));
		expect(resolved.name).toBe("ts-demo");
	});

	it("errors when holocron.config.ts has no default export", async () => {
		await writeFile(join(cwd, "holocron.config.ts"), `export const x: number = 1;`);
		const err = await loadConfig(cwd).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ConfigFileError);
		expect((err as Error).message).toMatch(/default export/);
	});

	// ── Priority ──────────────────────────────────────────────────────────

	it("prefers .json over .js when both exist", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "json-wins", providers: {} })
		);
		await writeFile(
			join(cwd, "holocron.config.js"),
			`export default { name: "js-loses", providers: {} };`
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.name).toBe("json-wins");
	});

	it("prefers .js over .ts when both exist (no .json)", async () => {
		await writeFile(
			join(cwd, "holocron.config.js"),
			`export default { name: "js-wins", providers: { source: "github" } };`
		);
		await writeFile(
			join(cwd, "holocron.config.ts"),
			`export default { name: "ts-loses", providers: { source: "github" } } as const;`
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.name).toBe("js-wins");
	});
});
