import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DotenvLoader } from "./loader.js";

const KEY = "ENV_UTILS_LOADER_TEST_KEY";

describe("DotenvLoader", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "env-utils-"));
		writeFileSync(join(dir, ".env"), `${KEY}=from-dotenv\n`);
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		delete process.env[KEY];
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		delete process.env[KEY];
		rmSync(dir, { recursive: true, force: true });
	});

	it("loads the .env in the working directory on load() and returns process.env", () => {
		const result = new DotenvLoader().load();

		expect(result).toBe(process.env);
		expect(result[KEY]).toBe("from-dotenv");
	});

	it("does not read a .env until load() is called", () => {
		new DotenvLoader();

		expect(process.env[KEY]).toBeUndefined();
	});

	it("reads the file once per loader, however often load() is called", () => {
		const loader = new DotenvLoader();
		loader.load();
		delete process.env[KEY];

		loader.load();

		expect(process.env[KEY]).toBeUndefined();
	});

	it("leaves a variable that is already set alone", () => {
		vi.stubEnv(KEY, "from-process");

		expect(new DotenvLoader().load()[KEY]).toBe("from-process");
	});

	it("returns undefined for keys that are in neither", () => {
		expect(new DotenvLoader().load()["DEFINITELY_NOT_SET_XYZ"]).toBeUndefined();
	});
});
