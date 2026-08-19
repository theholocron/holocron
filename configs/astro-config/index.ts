import type starlight from "@astrojs/starlight";
import type { docsTheme } from "@theholocron/docs-theme";
import { defineConfig as astroDefineConfig } from "astro/config";

type StarlightSidebar = NonNullable<Parameters<typeof starlight>[0]["sidebar"]>;

export interface DocsConfig {
	name: string;
	github: string;
	sidebar: StarlightSidebar;
}

export interface DocsConfigInput {
	docs: DocsConfig;
	starlight: typeof starlight;
	docsTheme: typeof docsTheme;
	srcDir?: string;
	outDir?: string;
	publicDir?: string;
	base?: string;
}

export function defineConfig({ docs, starlight, docsTheme, srcDir, outDir, publicDir, base }: DocsConfigInput) {
	return astroDefineConfig({
		base: base ?? `/${docs.github}`,
		...(srcDir && { srcDir }),
		...(outDir && { outDir }),
		...(publicDir && { publicDir }),
		integrations: [
			starlight({
				title: docs.name,
				plugins: [docsTheme()],
				social: [
					{
						icon: "github",
						label: "GitHub",
						href: `https://github.com/theholocron/${docs.github}`,
					},
				],
				sidebar: docs.sidebar,
			}),
		],
	});
}
