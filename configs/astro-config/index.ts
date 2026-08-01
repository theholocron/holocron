import { relative } from "node:path";
import { fileURLToPath } from "node:url";

import starlight from "@astrojs/starlight";
import { docsTheme } from "@theholocron/docs-theme";
import { defineConfig as astroDefineConfig } from "astro/config";

interface SidebarGroup {
	label: string;
	items: unknown[];
}

export interface DocsConfig {
	slug: string;
	name: string;
	sidebar: Array<
		{ label: string } & ({ slug: string } | { items: unknown[] })
	>;
}

export interface DocsConfigInput {
	docs: DocsConfig;
	importMetaUrl: string;
	sidebarLabel?: string;
}

export function defineConfig({
	docs,
	importMetaUrl,
	sidebarLabel,
}: DocsConfigInput) {
	const docsDir = fileURLToPath(new URL(".", importMetaUrl));
	const contentDir = fileURLToPath(
		new URL(`../packages/${docs.slug}-docs/content`, importMetaUrl),
	);
	const contentRelDir = relative(docsDir, contentDir);

	const secondItem = docs.sidebar[1] as SidebarGroup | undefined;
	const defaultLabel =
		secondItem !== undefined && "items" in secondItem
			? secondItem.label
			: "Contents";
	const label = sidebarLabel ?? defaultLabel;

	return astroDefineConfig({
		site: "https://theholocron.github.io",
		base: `/${docs.slug}`,
		integrations: [
			starlight({
				title: docs.name,
				plugins: [docsTheme()],
				social: [
					{
						icon: "github",
						label: "GitHub",
						href: `https://github.com/theholocron/${docs.slug}`,
					},
				],
				sidebar: [
					{ label: "Overview", slug: "" },
					{
						label,
						items: [{ autogenerate: { directory: contentRelDir } }],
					},
				],
			}),
		],
	});
}
