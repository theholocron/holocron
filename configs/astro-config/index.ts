import react from "@astrojs/react";
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
		vite: {
			resolve: {
				// @/ maps to the docs src dir so MDX pages avoid deep relative imports
				alias: { "@": new URL(srcDir ?? "src", `file://${process.cwd()}/`).pathname },
			},
		},
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
			react(),
		],
	});
}
