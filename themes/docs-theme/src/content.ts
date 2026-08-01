import { fileURLToPath } from "node:url";

import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

import { createDocsLoader } from "./loader.ts";

export interface DocsConfig {
	slug: string;
	name: string;
}

export function createDocsCollections(
	docsConfig: DocsConfig,
	importMetaUrl: string,
) {
	return {
		docs: defineCollection({
			loader: createDocsLoader([
				{
					dir: fileURLToPath(
						new URL(
							`../../packages/${docsConfig.slug}-docs/content`,
							importMetaUrl,
						),
					),
					slug: "",
				},
			]),
			schema: docsSchema(),
		}),
	};
}
