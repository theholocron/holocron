import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

/** The `docs` content collection for `src/content.config.ts`: Starlight's docs loader and schema. Exported from `@theholocron/docs-theme/content`. */
export function createDocsCollections() {
	// `defineCollection` is typed by the `astro:content` module the consuming site generates, which this package cannot see.
	/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
	return {
		docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	};
}
