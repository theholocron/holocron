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
	parent: string;
	name: string;
	sidebar: Array<SidebarLink | SidebarGroup>;
}

const config: DocsConfig = {
	slug: "clients/github",
	parent: "clients",
	name: "GitHub Client",
	sidebar: [{ label: "Overview", slug: "clients/github" }],
};

export default config;
