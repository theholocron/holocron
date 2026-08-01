import { describe, expect, it, vi } from "vitest";

vi.mock("astro/config", () => ({
	defineConfig: vi.fn((config: unknown) => config),
}));
vi.mock("@astrojs/starlight", () => ({
	default: vi.fn((config: unknown) => ({ name: "starlight", config })),
}));
vi.mock("@theholocron/docs-theme", () => ({
	docsTheme: vi.fn(() => ({ name: "@theholocron/docs-theme" })),
}));

import { defineConfig } from "./index.js";

const mockDocs = {
	slug: "clients",
	name: "Clients",
	sidebar: [
		{ label: "Overview", slug: "clients" },
		{ label: "Packages", items: [] },
	],
};

describe("defineConfig", () => {
	it("sets base from the docs slug", () => {
		const config = defineConfig({
			docs: mockDocs,
			importMetaUrl: import.meta.url,
		}) as {
			base: string;
		};
		expect(config.base).toBe("/clients");
	});

	it("derives sidebar label from sidebar[1].label when it is a group", () => {
		const config = defineConfig({
			docs: mockDocs,
			importMetaUrl: import.meta.url,
		}) as unknown as {
			integrations: Array<{
				config: { sidebar: Array<{ label: string }> };
			}>;
		};
		expect(config.integrations[0].config.sidebar[1].label).toBe("Packages");
	});

	it("accepts a sidebarLabel override", () => {
		const config = defineConfig({
			docs: mockDocs,
			importMetaUrl: import.meta.url,
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
		const linkDocs = {
			...mockDocs,
			sidebar: [
				{ label: "Overview", slug: "clients" },
				{ label: "Getting Started", slug: "clients/start" },
			],
		};
		const config = defineConfig({
			docs: linkDocs,
			importMetaUrl: import.meta.url,
		}) as unknown as {
			integrations: Array<{
				config: { sidebar: Array<{ label: string }> };
			}>;
		};
		expect(config.integrations[0].config.sidebar[1].label).toBe("Contents");
	});
});
