import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { library, reactApp, nodeApp } from "./index.js";

describe("vite-config", () => {
	describe("library preset", () => {
		it("returns a vite config with build.lib", async () => {
			const config = await library();
			expect(typeof config).toBe("object");
			expect(config.build?.lib).toBeDefined();
		});

		it("outputs ESM only", async () => {
			const config = await library();
			const formats =
				config.build?.lib && "formats" in config.build.lib
					? config.build.lib.formats
					: undefined;
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

	describe("nodeApp preset", () => {
		it("returns a vite config targeting node22", async () => {
			const config = await nodeApp();
			expect(config.build?.target).toBe("node22");
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
