import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("lint-staged-config", () => {
	afterEach(() => {
		vi.resetModules();
		vi.doUnmock("node:fs");
	});

	it("exports a non-empty config object", async () => {
		const { default: config } = await import("./index.js");
		expect(typeof config).toBe("object");
		expect(Object.keys(config).length).toBeGreaterThan(0);
	});

	it("every key is a glob pattern string", async () => {
		const { default: config } = await import("./index.js");
		for (const key of Object.keys(config)) {
			expect(typeof key).toBe("string");
			expect(key.length).toBeGreaterThan(0);
		}
	});

	it("every value is a command string or array of commands", async () => {
		const { default: config } = await import("./index.js");
		for (const value of Object.values(config)) {
			const isString = typeof value === "string";
			const isArray = Array.isArray(value) && value.every((v) => typeof v === "string");
			expect(isString || isArray).toBe(true);
		}
	});

	it("falls back to bare prettier/eslint when the shared config packages aren't installed", async () => {
		vi.doMock("node:fs", () => ({ existsSync: () => false }));
		const { default: config } = await import("./index.js");
		expect(config["*.{ts,tsx}"]).toEqual(["prettier --write", "eslint"]);
	});

	it("points --config at the shared packages' built entry points when installed — required for astromech's --config resolution to survive a deleted local prettier.config.ts/eslint.config.ts (theholocron/holocron#749)", async () => {
		vi.doMock("node:fs", () => ({ existsSync: () => true }));
		const { default: config } = await import("./index.js");
		const prettierConfig = resolve(process.cwd(), "node_modules/@theholocron/prettier-config/dist/index.js");
		const eslintConfig = resolve(process.cwd(), "node_modules/@theholocron/eslint-config/dist/bundles/library.js");
		expect(config["*.{ts,tsx}"]).toEqual([
			`prettier --config ${prettierConfig} --write`,
			`eslint --config ${eslintConfig}`,
		]);
	});

	it("resolves --config to an absolute path — a relative one silently fails to resolve under lint-staged's own spawn context (theholocron/clients#348)", async () => {
		vi.doMock("node:fs", () => ({ existsSync: () => true }));
		const { default: config } = await import("./index.js");
		const [prettierCmd] = config["*.{ts,tsx}"] as string[];
		const configPath = prettierCmd.split(" ")[2];
		expect(configPath).toMatch(/^\//);
	});
});
