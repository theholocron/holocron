import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import docsTheme from "../index.ts";

type SetupArgs = Parameters<ReturnType<typeof docsTheme>["hooks"]["setup"]>[0];

function callSetup(existingCss: string[] = []) {
	const plugin = docsTheme();
	const updateConfig = vi.fn();
	plugin.hooks.setup({
		config: { customCss: existingCss },
		updateConfig,
	} as unknown as SetupArgs);
	return updateConfig;
}

describe("docsTheme", () => {
	describe("plugin metadata", () => {
		it("has the correct name", () => {
			expect(docsTheme().name).toBe("@theholocron/docs-theme");
		});
	});

	describe("setup hook", () => {
		it("calls updateConfig once", () => {
			expect(callSetup()).toHaveBeenCalledOnce();
		});

		it("injects a styles.css path as the first customCss entry", () => {
			const updateConfig = callSetup();
			const { customCss } = updateConfig.mock.calls[0][0];
			expect(customCss[0]).toMatch(/styles\.css$/);
		});

		it("the injected CSS path resolves to an existing file", () => {
			const updateConfig = callSetup();
			const { customCss } = updateConfig.mock.calls[0][0];
			expect(existsSync(customCss[0])).toBe(true);
		});

		it("appends existing customCss entries after the injected path", () => {
			const userCss = "/path/to/user.css";
			const updateConfig = callSetup([userCss]);
			const { customCss } = updateConfig.mock.calls[0][0];
			expect(customCss).toHaveLength(2);
			expect(customCss[1]).toBe(userCss);
		});

		it("produces a single entry when config has no existing customCss", () => {
			const updateConfig = callSetup([]);
			const { customCss } = updateConfig.mock.calls[0][0];
			expect(customCss).toHaveLength(1);
		});

		it("handles undefined customCss in config", () => {
			const plugin = docsTheme();
			const updateConfig = vi.fn();
			plugin.hooks.setup({
				config: {},
				updateConfig,
			} as unknown as SetupArgs);
			const { customCss } = updateConfig.mock.calls[0][0];
			expect(customCss).toHaveLength(1);
		});
	});

	describe("styles.css", () => {
		const css = readFileSync(new URL("../styles.css", import.meta.url), "utf-8");

		it("defines dark mode accent variables", () => {
			expect(css).toContain('[data-theme="dark"]');
			expect(css).toContain("--sl-color-accent");
		});

		it("defines light mode accent variables", () => {
			expect(css).toContain('[data-theme="light"]');
			expect(css).toContain("--sl-color-accent");
		});
	});
});
