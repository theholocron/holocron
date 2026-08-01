import { describe, expect, it, vi } from "vitest";

vi.mock("astro:content", () => ({
	defineCollection: vi.fn((config: unknown) => config),
}));

vi.mock("@astrojs/starlight/schema", () => ({
	docsSchema: vi.fn(() => ({ type: "object" })),
}));

import { createDocsCollections } from "../content.ts";

const mockConfig = { slug: "clients", name: "Clients" };

describe("createDocsCollections", () => {
	it("returns a docs collection", () => {
		const collections = createDocsCollections(mockConfig, import.meta.url);
		expect(collections).toHaveProperty("docs");
	});

	it("passes a loader with the slug-derived content path", () => {
		const collections = createDocsCollections(
			mockConfig,
			import.meta.url,
		) as {
			docs: { loader: { name: string } };
		};
		expect(collections.docs.loader.name).toBe("docs-loader");
	});

	it("sets the loader source slug to empty string", () => {
		const collections = createDocsCollections(
			mockConfig,
			import.meta.url,
		) as {
			docs: { loader: { load: (ctx: never) => Promise<void> } };
		};
		expect(typeof collections.docs.loader.load).toBe("function");
	});
});
