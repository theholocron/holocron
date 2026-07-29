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
	slug: "clients",
	parent: null,
	name: "Clients",
	sidebar: [
		{ label: "Overview", slug: "clients" },
		{
			label: "Packages",
			items: [
				{ label: "Clerk", slug: "clients/clerk" },
				{ label: "Confluence", slug: "clients/confluence" },
				{ label: "Doppler", slug: "clients/doppler" },
				{ label: "GitHub", slug: "clients/github" },
				{ label: "Google", slug: "clients/google" },
				{ label: "HTTP (base)", slug: "clients/http" },
				{ label: "Infisical", slug: "clients/infisical" },
				{ label: "Jira", slug: "clients/jira" },
				{ label: "Neon", slug: "clients/neon" },
				{ label: "Postman", slug: "clients/postman" },
				{ label: "Vercel", slug: "clients/vercel" },
				{ label: "Zendesk", slug: "clients/zendesk" },
			],
		},
	],
};

export default config;
