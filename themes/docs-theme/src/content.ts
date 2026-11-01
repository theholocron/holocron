import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

/** The `docs` content collection for `src/content.config.ts`: Starlight's docs loader and schema. Exported from `@theholocron/docs-theme/content`. */
export function createDocsCollections() {
	return {
		docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	};
}
