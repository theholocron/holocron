import starlight from "@astrojs/starlight";
import { defineConfig } from "@theholocron/astro-config";
import { docsTheme } from "@theholocron/docs-theme";

export default defineConfig({
	docs: {
		name: "Holocron",
		github: "holocron",
		sidebar: [
			{ label: "Overview", slug: "" },
			{ label: "Getting Started", slug: "getting-started" },
			{ label: "Configuration", slug: "config" },
			{ label: "Capabilities", slug: "capabilities" },
			{ label: "Token Reference", slug: "tokens" },
			{ label: "Self-hosting", slug: "self-hosting" },
			{
				label: "Commands",
				items: [
					{ label: "auth", slug: "commands/auth" },
					{ label: "clone", slug: "commands/clone" },
					{ label: "config show", slug: "commands/config" },
					{ label: "deploy", slug: "commands/deploy" },
					{ label: "doctor", slug: "commands/doctor" },
					{ label: "new", slug: "commands/new" },
					{ label: "npm", slug: "commands/npm" },
					{ label: "plugin create", slug: "commands/plugin" },
					{ label: "secret set", slug: "commands/secret" },
					{ label: "secrets sync", slug: "commands/secrets" },
					{ label: "setup", slug: "commands/setup" },
					{ label: "skills", slug: "commands/skills" },
					{ label: "sync", slug: "commands/sync" },
					{ label: "sync-github", slug: "commands/sync-github" },
					{ label: "upgrade", slug: "commands/upgrade" },
				],
			},
			{
				label: "Plugins",
				items: [
					{ label: "Overview", slug: "plugins/overview" },
					{ label: "1Password", slug: "plugins/1password" },
					{ label: "Clerk", slug: "plugins/clerk" },
					{ label: "Cloudflare", slug: "plugins/cloudflare" },
					{ label: "Discord", slug: "plugins/discord" },
					{ label: "Doppler", slug: "plugins/doppler" },
					{ label: "GitHub", slug: "plugins/github" },
					{ label: "Infisical", slug: "plugins/infisical" },
					{ label: "Neon", slug: "plugins/neon" },
					{ label: "Postman", slug: "plugins/postman" },
					{ label: "Sentry", slug: "plugins/sentry" },
					{ label: "Slack", slug: "plugins/slack" },
					{ label: "Vercel", slug: "plugins/vercel" },
				],
			},
		],
	},
	starlight,
	docsTheme,
	srcDir: "./docs/src",
	outDir: "./docs/dist",
	publicDir: "./docs/public",
});
