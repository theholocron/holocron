import { describe, expect, it, vi } from "vitest";

vi.mock("astro:content", () => ({
	defineCollection: vi.fn((config: unknown) => config),
}));

vi.mock("@astrojs/starlight/schema", () => ({
	docsSchema: vi.fn(() => ({ type: "object" })),
}));

vi.mock("@astrojs/starlight/loaders", () => ({
	docsLoader: vi.fn(() => ({ name: "starlight-docs-loader" })),
}));

import { createDocsCollections } from "../content.ts";

describe("createDocsCollections", () => {
	it("returns a docs collection", () => {
		const collections = createDocsCollections();
		expect(collections).toHaveProperty("docs");
	});

	it("passes the starlight docs loader to the collection", () => {
		const collections = createDocsCollections() as {
			docs: { loader: { name: string } };
		};
		expect(collections.docs.loader.name).toBe("starlight-docs-loader");
	});
});
