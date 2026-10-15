import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectPackageManager } from "./detect-package-manager.ts";

const memory = (files: Record<string, string>) => ({
	readFile: (path: string) => {
		const text = files[path];
		if (text === undefined) throw new Error(`ENOENT: ${path}`);
		return text;
	},
	fileExists: (path: string) => path in files,
});

describe("detectPackageManager", () => {
	it("uses the name in package.json#packageManager", () => {
		const fs = memory({
			[join("/r", "package.json")]: '{"packageManager":"yarn@4.1.0"}',
			[join("/r", "pnpm-lock.yaml")]: "",
		});
		expect(detectPackageManager("/r", fs)).toBe("yarn");
	});

	it("ignores a packageManager it doesn't know, falling to the lockfile", () => {
		const fs = memory({
			[join("/r", "package.json")]: '{"packageManager":"deno@2"}',
			[join("/r", "bun.lock")]: "",
		});
		expect(detectPackageManager("/r", fs)).toBe("bun");
	});

	it("checks lockfiles in order: pnpm, bun, yarn, npm", () => {
		const all = ["pnpm-lock.yaml", "bun.lockb", "yarn.lock", "npm-shrinkwrap.json"];
		const expected = ["pnpm", "bun", "yarn", "npm"];
		all.forEach((file, i) => {
			const present = Object.fromEntries(all.slice(i).map((f) => [join("/r", f), ""]));
			expect(detectPackageManager("/r", memory(present))).toBe(expected[i]);
		});
	});

	it("reads package-lock.json as npm too, with npm-shrinkwrap.json taking precedence", () => {
		expect(detectPackageManager("/r", memory({ [join("/r", "package-lock.json")]: "" }))).toBe("npm");
		expect(detectPackageManager("/r", memory({ [join("/r", "npm-shrinkwrap.json")]: "" }))).toBe("npm");
	});

	it("falls back to pnpm, or to the fallback given", () => {
		expect(detectPackageManager("/r", memory({}))).toBe("pnpm");
		expect(detectPackageManager("/r", { ...memory({}), fallback: "npm" })).toBe("npm");
	});

	it("ignores a package.json that isn't valid or has a non-string packageManager", () => {
		expect(detectPackageManager("/r", memory({ [join("/r", "package.json")]: "{ nope" }))).toBe("pnpm");
		expect(detectPackageManager("/r", memory({ [join("/r", "package.json")]: '{"packageManager":7}' }))).toBe(
			"pnpm"
		);
	});

	describe("on a real directory", () => {
		let dir: string;
		beforeEach(async () => {
			dir = await mkdtemp(join(tmpdir(), "pkg-utils-pm-"));
		});
		afterEach(async () => {
			await rm(dir, { recursive: true, force: true });
		});

		it("reads package.json and lockfiles from disk by default", async () => {
			expect(detectPackageManager(dir, { fallback: "npm" })).toBe("npm");
			await writeFile(join(dir, "yarn.lock"), "");
			expect(detectPackageManager(dir)).toBe("yarn");
			await writeFile(join(dir, "package.json"), '{"packageManager":"bun@1.2.0"}');
			expect(detectPackageManager(dir)).toBe("bun");
		});
	});
});
