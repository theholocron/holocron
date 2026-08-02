import { describe, expect, it, vi } from "vitest";

vi.mock("astro/config", () => ({
	defineConfig: vi.fn((config: unknown) => config),
}));

import type starlight from "@astrojs/starlight";
import type { docsTheme } from "@theholocron/docs-theme";

import { defineConfig } from "./index.js";

const mockStarlight = vi.fn((config: unknown) => ({
	name: "starlight",
	config,
})) as unknown as typeof starlight;

const mockDocsTheme = vi.fn(() => ({
	name: "@theholocron/docs-theme",
})) as unknown as typeof docsTheme;

const mockDocs = {
	slug: "clients",
	name: "Clients",
	sidebar: [
		{ label: "Overview", slug: "clients" },
		{ label: "Packages", items: [] },
	],
};

const baseInput = {
	docs: mockDocs,
	importMetaUrl: import.meta.url,
	starlight: mockStarlight,
	docsTheme: mockDocsTheme,
};

describe("defineConfig", () => {
	it("sets base from the docs slug", () => {
		const config = defineConfig(baseInput) as { base: string };
		expect(config.base).toBe("/clients");
	});

	it("derives sidebar label from sidebar[1].label when it is a group", () => {
		const config = defineConfig(baseInput) as unknown as {
			integrations: Array<{
				config: { sidebar: Array<{ label: string }> };
			}>;
		};
		expect(config.integrations[0].config.sidebar[1].label).toBe("Packages");
	});

	it("accepts a sidebarLabel override", () => {
		const config = defineConfig({
			...baseInput,
			sidebarLabel: "Reference",
		}) as unknown as {
			integrations: Array<{
				config: { sidebar: Array<{ label: string }> };
			}>;
		};
		expect(config.integrations[0].config.sidebar[1].label).toBe(
			"Reference",
		);
	});

	it("falls back to 'Contents' when sidebar[1] is a link not a group", () => {
		const config = defineConfig({
			...baseInput,
			docs: {
				...mockDocs,
				sidebar: [
					{ label: "Overview", slug: "clients" },
					{ label: "Getting Started", slug: "clients/start" },
				],
			},
		}) as unknown as {
			integrations: Array<{
				config: { sidebar: Array<{ label: string }> };
			}>;
		};
		expect(config.integrations[0].config.sidebar[1].label).toBe("Contents");
	});
});
