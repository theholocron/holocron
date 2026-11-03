import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "ENV_UTILS_IMPORT_TEST_KEY";

describe("importing the package", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "env-utils-"));
		writeFileSync(join(dir, ".env"), `${KEY}=from-dotenv\n`);
		vi.spyOn(process, "cwd").mockReturnValue(dir);
		delete process.env[KEY];
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		delete process.env[KEY];
		rmSync(dir, { recursive: true, force: true });
	});

	it("does not read the .env in the working directory", async () => {
		const entry = await import("./index.js");
		await import("./lookup.js");

		expect(process.env[KEY]).toBeUndefined();
		expect(entry.createEnvLookup().get(KEY)).toBeUndefined();
	});

	it("loads it only when a parser is created with the default loader", async () => {
		const { createEnvParser } = await import("./index.js");

		const { get } = createEnvParser({ appName: "import-test", logger: { info: vi.fn(), warn: vi.fn() } });

		expect(get(KEY.toLowerCase())).toBe("from-dotenv");
	});

	it("leaves the lookup helpers reading process.env only", async () => {
		const { createEnvLookup, firstEnv, withEnvPrefix } = await import("./index.js");
		const env = createEnvLookup();
		vi.stubEnv("MYAPP_ENV_UTILS_X", "prefixed");

		expect(withEnvPrefix(env, "MYAPP").get("ENV_UTILS_X")).toBe("prefixed");
		expect(firstEnv(env, [KEY])).toBeUndefined();
	});
});
