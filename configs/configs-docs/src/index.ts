export interface SidebarLink {
	label: string;
	slug: string;
}

export interface SidebarGroup {
	label: string;
	items: Array<SidebarLink | SidebarGroup>;
}

export interface DocsConfig {
	slug: string;
	parent: string | null;
	name: string;
	sidebar: Array<SidebarLink | SidebarGroup>;
}

const config: DocsConfig = {
	slug: "configs",
	parent: null,
	name: "Configs",
	sidebar: [
		{ label: "Overview", slug: "configs" },
		{
			label: "Packages",
			items: [
				{ label: "Astro", slug: "configs/astro-config" },
				{ label: "Browserslist", slug: "configs/browserslist-config" },
				{ label: "CommitLint", slug: "configs/commitlint-config" },
				{ label: "ESLint", slug: "configs/eslint-config" },
				{ label: "Holocron", slug: "configs/holocron-config" },
				{ label: "Lint Staged", slug: "configs/lint-staged-config" },
				{ label: "Prettier", slug: "configs/prettier-config" },
				{
					label: "Semantic Release",
					slug: "configs/semantic-release-config",
				},
				{ label: "Storybook", slug: "configs/storybook-config" },
				{ label: "Stylelint", slug: "configs/stylelint-config" },
				{ label: "TSConfig", slug: "configs/tsconfig" },
				{ label: "tsdown", slug: "configs/tsdown-config" },
				{ label: "Vite", slug: "configs/vite-config" },
				{ label: "Vitest", slug: "configs/vitest-config" },
			],
		},
	],
};

export default config;
