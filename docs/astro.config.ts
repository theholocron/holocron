import starlight from "@astrojs/starlight";
import { docsTheme } from "@theholocron/docs-theme";
import { defineConfig } from "@theholocron/astro-config";
import holocronConfig from "@theholocron/holocron-docs";

export default defineConfig({
	docs: holocronConfig,
	importMetaUrl: import.meta.url,
	starlight,
	docsTheme,
	sidebarLabel: "Reference",
});
