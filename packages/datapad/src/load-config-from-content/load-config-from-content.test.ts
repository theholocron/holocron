import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigFileError } from "../errors/index.js";
import { loadConfigFromContent } from "./load-config-from-content.js";

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
