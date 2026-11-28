import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { library, nodeApp, reactApp, reactLibrary } from "./index.js";
import { getPackageName } from "./presets/get-package-name.js";

describe("vite-config", () => {
	describe("library preset", () => {
		it("returns a vite config with build.lib", async () => {
			const config = await library();
			expect(typeof config).toBe("object");
			expect(config.build?.lib).toBeDefined();
		});

		it("names the bundle index.mjs", async () => {
			const lib = (await library()).build?.lib;
			const fileName = lib && "fileName" in lib ? lib.fileName : undefined;
			expect((fileName as () => string)()).toBe("index.mjs");
		});

		it("outputs ESM only", async () => {
			const config = await library();
			const formats = config.build?.lib && "formats" in config.build.lib ? config.build.lib.formats : undefined;
			expect(formats).toContain("es");
		});

		it("externalises react by default", async () => {
			const config = await library();
			const external = config.build?.rollupOptions?.external;
			const externalList = Array.isArray(external) ? external : [];
			expect(externalList).toContain("react");
		});
	});

	describe("reactApp preset", () => {
		it("returns a vite config object", async () => {
			const config = await reactApp();
			expect(typeof config).toBe("object");
		});
	});

	describe("reactLibrary preset", () => {
		it("returns a vite config with build.lib", async () => {
			const config = await reactLibrary();
			expect(typeof config).toBe("object");
			expect(config.build?.lib).toBeDefined();
		});

		it("outputs ESM and CJS by default", async () => {
			const config = await reactLibrary();
			const formats = config.build?.lib && "formats" in config.build.lib ? config.build.lib.formats : undefined;
			expect(formats).toContain("es");
			expect(formats).toContain("cjs");
		});

		it("externalises react and react-dom", async () => {
			const config = await reactLibrary();
			const external = config.build?.rollupOptions?.external;
			const list = Array.isArray(external) ? external : [];
			expect(list).toContain("react");
			expect(list).toContain("react-dom");
		});

		it("accepts additional externals", async () => {
			const config = await reactLibrary({ external: ["lodash"] });
			const external = config.build?.rollupOptions?.external;
			const list = Array.isArray(external) ? external : [];
			expect(list).toContain("lodash");
		});

		it("uses resolved name in fileName", async () => {
			const config = await reactLibrary({ name: "my-lib" });
			const lib = config.build?.lib;
			const fileName = lib && "fileName" in lib ? lib.fileName : undefined;
			expect(typeof fileName).toBe("function");
			const toFileName = fileName as (format: string, entry: string) => string;
			expect(toFileName("es", "index")).toBe("my-lib.es.js");
			expect(toFileName("cjs", "index")).toBe("my-lib.cjs.js");
		});

		it("sets @ alias to <cwd>/src by default", async () => {
			const config = await reactLibrary();
			const alias = config.resolve?.alias;
			const atAlias = Array.isArray(alias)
				? alias.find((a) => a.find === "@")?.replacement
				: (alias as Record<string, string>)?.["@"];
			expect(atAlias).toContain("src");
		});

		it("merges overrides into the base config", async () => {
			const config = await reactLibrary({ overrides: { publicDir: "public" } });
			expect(config.publicDir).toBe("public");
		});
	});

	describe("nodeApp preset", () => {
		it("returns a vite config targeting node22", async () => {
			const config = await nodeApp();
			expect(config.build?.target).toBe("node22");
		});

		it("names the bundle index.mjs", async () => {
			const lib = (await nodeApp()).build?.lib;
			const fileName = lib && "fileName" in lib ? lib.fileName : undefined;
			expect((fileName as () => string)()).toBe("index.mjs");
		});
	});

	describe("getPackageName", () => {
		let dir: string;
		let originalCwd: string;

		beforeEach(() => {
			originalCwd = process.cwd();
			dir = mkdtempSync(join(tmpdir(), "vite-config-package-name-"));
			process.chdir(dir);
		});

		afterEach(() => {
			process.chdir(originalCwd);
			rmSync(dir, { recursive: true, force: true });
		});

		it("reads the name from the package.json in the working directory", () => {
			writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "@acme/thing" }));
			expect(getPackageName()).toBe("@acme/thing");
		});

		it("is 'unknown' when the package.json has no name", () => {
			writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.0.0" }));
			expect(getPackageName()).toBe("unknown");
		});

		it("is 'unknown' when there is no readable package.json", () => {
			expect(getPackageName()).toBe("unknown");
		});
	});

	describe("Codecov bundle analysis", () => {
		beforeEach(() => {
			process.env.CODECOV_TOKEN = "test-token";
		});

		afterEach(() => {
			delete process.env.CODECOV_TOKEN;
		});

		it("library() includes the Codecov plugin when CODECOV_TOKEN is set", async () => {
			const config = await library();
			const plugins = (config.plugins ?? []) as unknown[];
			expect(plugins.length).toBeGreaterThan(0);
		});

		it("reactApp() includes the Codecov plugin when CODECOV_TOKEN is set", async () => {
			const config = await reactApp();
			const plugins = (config.plugins ?? []) as unknown[];
			// reactApp also loads @vitejs/plugin-react, so at least 2 plugins
			expect(plugins.length).toBeGreaterThanOrEqual(2);
		});

		it("nodeApp() includes the Codecov plugin when CODECOV_TOKEN is set", async () => {
			const config = await nodeApp();
			const plugins = (config.plugins ?? []) as unknown[];
			expect(plugins.length).toBeGreaterThan(0);
		});
	});
});
