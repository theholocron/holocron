import { defineConfig } from "@theholocron/astro-config";
import holocronConfig from "@theholocron/holocron-docs";

export default defineConfig({
	docs: holocronConfig,
	importMetaUrl: import.meta.url,
	sidebarLabel: "Reference",
});
