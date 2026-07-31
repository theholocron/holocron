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
	slug: "holocron",
	parent: null,
	name: "Holocron",
	sidebar: [
		{ label: "Overview", slug: "holocron" },
		{ label: "Getting Started", slug: "holocron/getting-started" },
		{ label: "Configuration", slug: "holocron/config" },
		{ label: "Capabilities", slug: "holocron/capabilities" },
		{ label: "Token Reference", slug: "holocron/tokens" },
		{ label: "Self-hosting", slug: "holocron/self-hosting" },
		{
			label: "Commands",
			items: [
				{ label: "auth", slug: "holocron/commands/auth" },
				{ label: "clone", slug: "holocron/commands/clone" },
				{ label: "config show", slug: "holocron/commands/config" },
				{ label: "deploy", slug: "holocron/commands/deploy" },
				{ label: "doctor", slug: "holocron/commands/doctor" },
				{ label: "new", slug: "holocron/commands/new" },
				{ label: "npm", slug: "holocron/commands/npm" },
				{ label: "plugin create", slug: "holocron/commands/plugin" },
				{ label: "secret set", slug: "holocron/commands/secret" },
				{ label: "secrets sync", slug: "holocron/commands/secrets" },
				{ label: "setup", slug: "holocron/commands/setup" },
				{ label: "skills", slug: "holocron/commands/skills" },
				{ label: "sync", slug: "holocron/commands/sync" },
				{ label: "sync-github", slug: "holocron/commands/sync-github" },
				{ label: "upgrade", slug: "holocron/commands/upgrade" },
			],
		},
		{
			label: "Plugins",
			items: [
				{ label: "Overview", slug: "holocron/plugins/overview" },
				{ label: "1Password", slug: "holocron/plugins/1password" },
				{ label: "Clerk", slug: "holocron/plugins/clerk" },
				{ label: "Doppler", slug: "holocron/plugins/doppler" },
				{ label: "GitHub", slug: "holocron/plugins/github" },
				{ label: "Infisical", slug: "holocron/plugins/infisical" },
				{ label: "Neon", slug: "holocron/plugins/neon" },
				{ label: "Postman", slug: "holocron/plugins/postman" },
				{ label: "Vercel", slug: "holocron/plugins/vercel" },
			],
		},
	],
};

export default config;
