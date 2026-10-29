import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

export function createDocsCollections() {
	return {
		docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	};
}
