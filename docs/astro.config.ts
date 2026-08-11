import starlight from "@astrojs/starlight";
import { defineConfig } from "@theholocron/astro-config";
import { docsTheme } from "@theholocron/docs-theme";
import holocronConfig from "@theholocron/holocron-docs";

export default defineConfig({
	docs: holocronConfig,
	importMetaUrl: import.meta.url,
	starlight,
	docsTheme,
	sidebarLabel: "Reference",
});
