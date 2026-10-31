import { describe, expect, it, vi } from "vitest";

vi.mock("astro/config", () => ({
	defineConfig: vi.fn((config: unknown) => config),
}));

vi.mock("@astrojs/react", () => ({
	default: vi.fn(() => ({ name: "@astrojs/react" })),
}));

import type starlight from "@astrojs/starlight";
import type { docsTheme } from "@theholocron/docs-theme";

import { apiReference, defineConfig } from "./index.js";

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

	it("adds the docs theme first, then any further plugins", () => {
		const extra = { name: "extra", hooks: {} };
		const config = defineConfig({ ...baseInput, plugins: [extra] }) as unknown as {
			integrations: Array<{ config: { plugins: unknown[] } }>;
		};
		expect(config.integrations[0].config.plugins).toEqual([{ name: "@theholocron/docs-theme" }, extra]);
	});

	it("adds only the docs theme when no plugins are given", () => {
		const config = defineConfig(baseInput) as unknown as {
			integrations: Array<{ config: { plugins: unknown[] } }>;
		};
		expect(config.integrations[0].config.plugins).toEqual([{ name: "@theholocron/docs-theme" }]);
	});

	it("passes docs.sidebar directly to starlight", () => {
		const config = defineConfig(baseInput) as unknown as {
			integrations: Array<{ config: { sidebar: unknown } }>;
		};
		expect(config.integrations[0].config.sidebar).toBe(mockDocs.sidebar);
	});

	it("does not include site when omitted", () => {
		const config = defineConfig(baseInput) as { site?: string };
		expect(config.site).toBeUndefined();
	});

	it("passes site through when provided, so Starlight can generate a sitemap", () => {
		const config = defineConfig({ ...baseInput, site: "https://docs.theholocron.dev" }) as { site: string };
		expect(config.site).toBe("https://docs.theholocron.dev");
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

	it("derives base from docs.github by default", () => {
		const config = defineConfig(baseInput) as { base: string };
		expect(config.base).toBe("/clients");
	});

	it("allows base to be overridden", () => {
		const config = defineConfig({ ...baseInput, base: "/" }) as { base: string };
		expect(config.base).toBe("/");
	});

	it("includes @astrojs/react integration", () => {
		const config = defineConfig(baseInput) as unknown as {
			integrations: Array<{ name: string }>;
		};
		expect(config.integrations.some((i) => i.name === "@astrojs/react")).toBe(true);
	});
});

describe("apiReference", () => {
	const group = { label: "API reference", autogenerate: { directory: "x/api" } };
	const plugin = vi.fn((options: unknown) => ({ name: "starlight-typedoc", options }));
	const createPlugin = vi.fn(() => [plugin, group]) as unknown as Parameters<typeof apiReference>[0]["createPlugin"];

	it("resolves the entry point and tsconfig from the repo root and writes under <package>/api", () => {
		const result = apiReference({ createPlugin, root: new URL("file:///repo/"), package: "utils/array-utils" });
		expect(result.plugin).toEqual({
			name: "starlight-typedoc",
			options: {
				entryPoints: ["/repo/utils/array-utils/src/index.ts"],
				tsconfig: "/repo/utils/array-utils/tsconfig.json",
				output: "utils/array-utils/api",
				sidebar: { label: "API reference", collapsed: true },
			},
		});
		expect(result.group).toBe(group);
	});

	it("takes the root as a string, several entry points and a label", () => {
		const result = apiReference({
			createPlugin,
			root: "file:///repo/",
			package: "clients/http-client",
			entryPoints: ["src/index.ts", "src/testing.ts"],
			label: "Reference",
		});
		expect(result.plugin).toMatchObject({
			options: {
				entryPoints: ["/repo/clients/http-client/src/index.ts", "/repo/clients/http-client/src/testing.ts"],
				sidebar: { label: "Reference", collapsed: true },
			},
		});
	});
});
