import starlight from "@astrojs/starlight";
import { apiReference, defineConfig } from "@theholocron/astro-config";
import { docsTheme } from "@theholocron/docs-theme";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";

const UTILS = [
	"array-utils",
	"date-time-utils",
	"env-utils",
	"fs-utils",
	"git-utils",
	"json-utils",
	"location-utils",
	"misc-utils",
	"object-utils",
	"pkg-utils",
	"storage-utils",
	"string-utils",
	"uri-utils",
] as const;

const CLIENTS = [
	"axiom-client",
	"checkly-client",
	"clerk-client",
	"cloudflare-client",
	"confluence-client",
	"discord-client",
	"doppler-client",
	"github-client",
	"google-client",
	"http-client",
	"infisical-client",
	"jira-client",
	"neon-client",
	"netlify-client",
	"posthog-client",
	"postman-client",
	"sentry-client",
	"slack-client",
	"vercel-client",
	"zendesk-client",
] as const;

// The reference is generated from each package's TSDoc comments every time the docs are built or served, and is not
// committed (it is gitignored).
const referenceFor = (group: string, names: readonly string[]) =>
	names.map((name) => ({
		name,
		api: apiReference({
			createPlugin: createStarlightTypeDocPlugin,
			root: new URL("./", import.meta.url),
			package: `${group}/${name}`,
		}),
	}));
const utilsApi = referenceFor("utils", UTILS);
const clientsApi = referenceFor("clients", CLIENTS);

export default defineConfig({
	site: "https://docs.theholocron.dev",
	docs: {
		name: "Holocron",
		github: "holocron",
		sidebar: [
			{ label: "Overview", slug: "" },
			{ label: "Getting Started", slug: "getting-started" },
			{ label: "Configuration", slug: "config" },
			{ label: "Capabilities", slug: "capabilities" },
			{ label: "Token Reference", slug: "tokens" },
			{ label: "Server as Code", slug: "server-as-code" },
			{ label: "Self-hosting", slug: "self-hosting" },
			{
				label: "Commands",
				items: [
					{ label: "auth", slug: "commands/auth" },
					{ label: "clone", slug: "commands/clone" },
					{ label: "config show", slug: "commands/config-show" },
					{ label: "deploy", slug: "commands/deploy" },
					{ label: "doctor", slug: "commands/doctor" },
					{ label: "doctor notifications", slug: "commands/doctor-notifications" },
					{ label: "new plugin", slug: "commands/new-plugin" },
					{ label: "new repo", slug: "commands/new-repo" },
					{ label: "notifications channel add", slug: "commands/notifications-channel-add" },
					{ label: "notifications link", slug: "commands/notifications-link" },
					{ label: "notifications setup", slug: "commands/notifications-setup" },
					{ label: "notifications create-server", slug: "commands/notifications-create-server" },
					{ label: "notifications sync-roles", slug: "commands/notifications-sync-roles" },
					{ label: "package bump-versions", slug: "commands/package-bump-versions" },
					{ label: "package publish", slug: "commands/package-publish" },
					{ label: "repo cleanup", slug: "commands/repo-cleanup" },
					{ label: "repo setup", slug: "commands/repo-setup" },
					{ label: "repo sync", slug: "commands/repo-sync" },
					{ label: "repo upgrade", slug: "commands/repo-upgrade" },
					{ label: "run", slug: "commands/run" },
					{ label: "run ci", slug: "commands/run-ci" },
					{ label: "secrets set", slug: "commands/secrets-set" },
					{ label: "secrets sync", slug: "commands/secrets-sync" },
					{ label: "skills", slug: "commands/skills" },
					{ label: "sync github", slug: "commands/sync-github" },
				],
			},
			{
				label: "Workflows",
				items: [{ label: "stale", slug: "workflows/stale" }],
			},
			{
				label: "Observability",
				items: [
					{ label: "Overview", slug: "observability" },
					{ label: "Getting Started", slug: "observability/getting-started" },
				],
			},
			{
				label: "Skills",
				items: [
					{ label: "Overview", slug: "skills" },
					{ label: "commit-standards", slug: "skills/commit-standards" },
					{ label: "destructive-command-guard", slug: "skills/destructive-command-guard" },
					{ label: "git-safety", slug: "skills/git-safety" },
					{ label: "holocron-skill-client", slug: "skills/holocron-skill-client" },
					{ label: "holocron-skill-config", slug: "skills/holocron-skill-config" },
					{ label: "holocron-skill-plugin", slug: "skills/holocron-skill-plugin" },
					{ label: "holocron-skill-skill", slug: "skills/holocron-skill-skill" },
					{ label: "holocron-skill-util", slug: "skills/holocron-skill-util" },
					{ label: "pr-workflow", slug: "skills/pr-workflow" },
					{ label: "security-review", slug: "skills/security-review" },
				],
			},
			{
				label: "Clients",
				items: [
					{ label: "Overview", slug: "clients" },
					// a client's page is `clients/<name without "-client">`; its reference is built under `clients/<name>/api`
					...clientsApi.map(({ name, api }) => ({
						label: name,
						items: [{ label: "Overview", slug: `clients/${name.replace(/-client$/, "")}` }, api.group],
					})),
				],
			},
			{
				label: "Utils",
				items: [
					{ label: "Overview", slug: "utils" },
					...utilsApi.map(({ name, api }) => ({
						label: name,
						items: [{ label: "Overview", slug: `utils/${name}` }, api.group],
					})),
				],
			},
			{
				label: "Configs",
				items: [
					{ label: "Overview", slug: "configs" },
					{ label: "astro-config", slug: "configs/astro-config" },
					{ label: "browserslist-config", slug: "configs/browserslist-config" },
					{ label: "commitlint-config", slug: "configs/commitlint-config" },
					{ label: "devmoji-config", slug: "configs/devmoji-config" },
					{ label: "eslint-config", slug: "configs/eslint-config" },
					{ label: "lighthouse-config", slug: "configs/lighthouse-config" },
					{ label: "lint-staged-config", slug: "configs/lint-staged-config" },
					{ label: "prettier-config", slug: "configs/prettier-config" },
					{ label: "rollup-plugin-transform-template", slug: "configs/rollup-plugin-transform-template" },
					{ label: "semantic-release-config", slug: "configs/semantic-release-config" },
					{ label: "storybook-config", slug: "configs/storybook-config" },
					{ label: "stylelint-config", slug: "configs/stylelint-config" },
					{ label: "tsconfig", slug: "configs/tsconfig" },
					{ label: "tsdown-config", slug: "configs/tsdown-config" },
					{ label: "vite-config", slug: "configs/vite-config" },
					{ label: "vitest-config", slug: "configs/vitest-config" },
				],
			},
			{
				label: "Packages",
				items: [
					{ label: "cli", slug: "cli" },
					{ label: "astromech", slug: "astromech" },
					{ label: "datapad", slug: "datapad" },
					{ label: "comlink", slug: "comlink" },
					{ label: "sentinel", slug: "sentinel" },
				],
			},
			{
				label: "Themes",
				items: [{ label: "docs-theme", slug: "themes/docs-theme" }],
			},
			{
				label: "Legal",
				items: [
					{ label: "Terms of Service", slug: "legal/terms" },
					{ label: "Privacy Policy", slug: "legal/privacy" },
				],
			},
			{
				label: "Plugins",
				items: [
					{ label: "Overview", slug: "plugins/overview" },
					{ label: "1Password", slug: "plugins/1password" },
					{ label: "Axiom", slug: "plugins/axiom" },
					{ label: "Checkly", slug: "plugins/checkly" },
					{ label: "Clerk", slug: "plugins/clerk" },
					{ label: "Cloudflare", slug: "plugins/cloudflare" },
					{ label: "Discord", slug: "plugins/discord" },
					{ label: "Doppler", slug: "plugins/doppler" },
					{ label: "GitHub", slug: "plugins/github" },
					{ label: "Infisical", slug: "plugins/infisical" },
					{ label: "Netlify", slug: "plugins/netlify" },
					{ label: "Neon", slug: "plugins/neon" },
					{ label: "PostHog", slug: "plugins/posthog" },
					{ label: "Postman", slug: "plugins/postman" },
					{ label: "Sentry", slug: "plugins/sentry" },
					{ label: "Slack", slug: "plugins/slack" },
					{ label: "Vercel", slug: "plugins/vercel" },
				],
			},
		],
	},
	plugins: [...utilsApi, ...clientsApi].map(({ api }) => api.plugin),
	starlight,
	docsTheme,
	srcDir: "./docs/src",
	outDir: "./docs/dist",
	publicDir: "./docs/public",
});
