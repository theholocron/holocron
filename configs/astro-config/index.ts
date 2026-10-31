import { fileURLToPath } from "node:url";

import react from "@astrojs/react";
import type starlight from "@astrojs/starlight";
import type { docsTheme } from "@theholocron/docs-theme";
import { defineConfig as astroDefineConfig } from "astro/config";
import type { createStarlightTypeDocPlugin } from "starlight-typedoc";

type StarlightSidebar = NonNullable<Parameters<typeof starlight>[0]["sidebar"]>;
type StarlightPlugins = NonNullable<Parameters<typeof starlight>[0]["plugins"]>;

export interface DocsConfig {
	name: string;
	github: string;
	sidebar: StarlightSidebar;
}

export interface DocsConfigInput {
	docs: DocsConfig;
	starlight: typeof starlight;
	docsTheme: typeof docsTheme;
	/** Further Starlight plugins, added after the docs theme (for example the ones `apiReference()` returns). */
	plugins?: StarlightPlugins;
	srcDir?: string;
	outDir?: string;
	publicDir?: string;
	base?: string;
	/** The site's absolute origin (for example `https://docs.theholocron.dev`). Starlight needs it to generate a sitemap. */
	site?: string;
}

export function defineConfig({
	docs,
	starlight,
	docsTheme,
	plugins,
	srcDir,
	outDir,
	publicDir,
	base,
	site,
}: DocsConfigInput): ReturnType<typeof astroDefineConfig> {
	return astroDefineConfig({
		...(site && { site }),
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
				plugins: [docsTheme(), ...(plugins ?? [])],
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

export interface ApiReferenceInput {
	/** `createStarlightTypeDocPlugin` from your own `starlight-typedoc` import, as with `starlight` and `docsTheme`. */
	createPlugin: typeof createStarlightTypeDocPlugin;
	/** The repo root, as a URL or path: `new URL("./", import.meta.url)` from a config at the root. */
	root: URL | string;
	/** The package's folder from the repo root (`utils/array-utils`). */
	package: string;
	/** Entry points, relative to the package. Defaults to `src/index.ts`. */
	entryPoints?: string[];
	/** The sidebar group's label. Defaults to "API reference". */
	label?: string;
}

export interface ApiReference {
	/** Add to `defineConfig({ plugins })`. */
	plugin: StarlightPlugins[number];
	/** Put in the sidebar where the reference should appear. */
	group: StarlightSidebar[number];
}

/**
 * The generated API reference of one package: its TSDoc comments, run through TypeDoc each time the docs are built
 * or served, as pages under `<package>/api` and a collapsed sidebar group. Nothing generated is committed.
 *
 * `starlight-typedoc` ships TypeScript source, so, like `starlight` and `docsTheme`, it is imported by the site's
 * own config and passed in, which keeps Astro's loader in charge of it. Install `starlight-typedoc`, `typedoc` and
 * `typedoc-plugin-markdown` in the site.
 */
export function apiReference({
	createPlugin,
	root,
	package: dir,
	entryPoints = ["src/index.ts"],
	label = "API reference",
}: ApiReferenceInput): ApiReference {
	const [plugin, group] = createPlugin();
	const inPackage = (path: string): string => fileURLToPath(new URL(`${dir}/${path}`, root));
	return {
		group,
		plugin: plugin({
			entryPoints: entryPoints.map(inPackage),
			tsconfig: inPackage("tsconfig.json"),
			output: `${dir}/api`,
			sidebar: { label, collapsed: true },
		}),
	};
}
