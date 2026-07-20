import { execSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

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

	// ── name derivation ───────────────────────────────────────────────────

	it("derives name from package.json when absent from config", async () => {
		await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "my-package" }));
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ providers: { source: "github" } }));
		const { resolved } = await loadConfig(cwd);
		expect(resolved.name).toBe("my-package");
	});

	it("strips @scope/ prefix from scoped package names", async () => {
		await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "@theholocron/my-package" }));
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ providers: { source: "github" } }));
		const { resolved } = await loadConfig(cwd);
		expect(resolved.name).toBe("my-package");
	});

	it("falls back to directory basename when no package.json exists", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ providers: { source: "github" } }));
		const { resolved } = await loadConfig(cwd);
		expect(resolved.name).toBe(basename(cwd));
	});

	it("does not override name when explicitly set in config", async () => {
		await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "from-package-json" }));
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "from-config", providers: { source: "github" } })
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.name).toBe("from-config");
	});

	// ── repo.name derivation ──────────────────────────────────────────────

	it("leaves repo.name absent when no git remote is configured", async () => {
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "demo", repo: {}, providers: { source: "github" } })
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.repo?.name).toBeUndefined();
	});

	it("derives repo.name from an HTTPS git remote", async () => {
		execSync("git init", { cwd });
		execSync("git remote add origin https://github.com/theholocron/my-app.git", { cwd });
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "demo", repo: {}, providers: { source: "github" } })
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.repo?.name).toBe("theholocron/my-app");
	});

	it("derives repo.name from an SSH git remote", async () => {
		execSync("git init", { cwd });
		execSync("git remote add origin git@github.com:theholocron/my-app.git", { cwd });
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "demo", repo: {}, providers: { source: "github" } })
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.repo?.name).toBe("theholocron/my-app");
	});

	it("does not override repo.name when explicitly set in config", async () => {
		execSync("git init", { cwd });
		execSync("git remote add origin https://github.com/theholocron/ignored.git", { cwd });
		await writeFile(
			join(cwd, "holocron.config.json"),
			JSON.stringify({ name: "demo", repo: { name: "theholocron/explicit" }, providers: { source: "github" } })
		);
		const { resolved } = await loadConfig(cwd);
		expect(resolved.repo?.name).toBe("theholocron/explicit");
	});

	// ── Priority ──────────────────────────────────────────────────────────

	it("prefers .json over .js when both exist", async () => {
		await writeFile(join(cwd, "holocron.config.json"), JSON.stringify({ name: "json-wins", providers: {} }));
		await writeFile(join(cwd, "holocron.config.js"), `export default { name: "js-loses", providers: {} };`);
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
