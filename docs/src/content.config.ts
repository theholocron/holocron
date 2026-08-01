import { createDocsCollections } from "@theholocron/docs-theme/content";
import holocronConfig from "@theholocron/holocron-docs";

export const collections = createDocsCollections(holocronConfig, import.meta.url);
