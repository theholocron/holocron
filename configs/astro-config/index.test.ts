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
	name: "Clients",
	github: "clients",
	sidebar: [
		{ label: "Overview", slug: "" },
		{ label: "Packages", items: [{ label: "GitHub", slug: "github" }] },
	],
};

const baseInput = {
	docs: mockDocs,
	starlight: mockStarlight,
	docsTheme: mockDocsTheme,
};

describe("defineConfig", () => {
	it("uses docs.name as the starlight title", () => {
		const config = defineConfig(baseInput) as unknown as {
			integrations: Array<{ config: { title: string } }>;
		};
		expect(config.integrations[0].config.title).toBe("Clients");
	});

	it("uses docs.github for the GitHub social link", () => {
		const config = defineConfig(baseInput) as unknown as {
			integrations: Array<{ config: { social: Array<{ href: string }> } }>;
		};
		expect(config.integrations[0].config.social[0].href).toBe("https://github.com/theholocron/clients");
	});

	it("passes docs.sidebar directly to starlight", () => {
		const config = defineConfig(baseInput) as unknown as {
			integrations: Array<{ config: { sidebar: unknown } }>;
		};
		expect(config.integrations[0].config.sidebar).toBe(mockDocs.sidebar);
	});

	it("does not include srcDir when omitted", () => {
		const config = defineConfig(baseInput) as { srcDir?: string };
		expect(config.srcDir).toBeUndefined();
	});

	it("passes srcDir through when provided", () => {
		const config = defineConfig({ ...baseInput, srcDir: "./docs/src" }) as { srcDir: string };
		expect(config.srcDir).toBe("./docs/src");
	});

	it("passes outDir through when provided", () => {
		const config = defineConfig({ ...baseInput, outDir: "./docs/dist" }) as { outDir: string };
		expect(config.outDir).toBe("./docs/dist");
	});

	it("passes publicDir through when provided", () => {
		const config = defineConfig({ ...baseInput, publicDir: "./docs/public" }) as { publicDir: string };
		expect(config.publicDir).toBe("./docs/public");
	});
});
