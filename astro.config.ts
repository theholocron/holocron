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

/** Every config package's page, in sidebar order. `browserslist-config` and `tsconfig` have no TypeScript API. */
const CONFIGS = [
	"astro-config",
	"browserslist-config",
	"commitlint-config",
	"devmoji-config",
	"eslint-config",
	"lighthouse-config",
	"lint-staged-config",
	"prettier-config",
	"rollup-plugin-transform-template",
	"semantic-release-config",
	"storybook-config",
	"stylelint-config",
	"tsconfig",
	"tsdown-config",
	"vite-config",
	"vitest-config",
] as const;
const CONFIGS_WITHOUT_API: readonly string[] = ["browserslist-config", "tsconfig"];

/** Every plugin's page slug and sidebar label, in sidebar order; the package is `plugins/holocron-plugin-<slug>`. */
const PLUGINS = [
	["1password", "1Password"],
	["axiom", "Axiom"],
	["checkly", "Checkly"],
	["clerk", "Clerk"],
	["cloudflare", "Cloudflare"],
	["discord", "Discord"],
	["doppler", "Doppler"],
	["github", "GitHub"],
	["infisical", "Infisical"],
	["netlify", "Netlify"],
	["neon", "Neon"],
	["posthog", "PostHog"],
	["postman", "Postman"],
	["sentry", "Sentry"],
	["slack", "Slack"],
	["vercel", "Vercel"],
] as const;

// The reference is generated from each package's TSDoc comments every time the docs are built or served, and is not
// committed (it is gitignored). `entryPoints` is relative to the package; the default is `src/index.ts`.
const referenceFor = (dir: string, entryPoints?: readonly string[], skipErrorChecking = false) =>
	apiReference({
		createPlugin: createStarlightTypeDocPlugin,
		root: new URL("./", import.meta.url),
		package: dir,
		...(entryPoints ? { entryPoints: [...entryPoints] } : {}),
		skipErrorChecking,
	});
const referencesFor = (
	group: string,
	names: readonly string[],
	entryPoints?: (name: string) => readonly string[],
	skipErrorChecking?: (name: string) => boolean
) =>
	names.map((name) => ({
		name,
		api: referenceFor(`${group}/${name}`, entryPoints?.(name), skipErrorChecking?.(name)),
	}));
const utilsApi = referencesFor("utils", UTILS);
const clientsApi = referencesFor("clients", CLIENTS);
// a config package keeps its entry point at the package root, except the rollup plugin
const configsApi = referencesFor(
	"configs",
	CONFIGS.filter((name) => !CONFIGS_WITHOUT_API.includes(name)),
	(name) => (name === "rollup-plugin-transform-template" ? ["src/index.ts"] : ["index.ts"]),
	// astro-config's types come from Starlight, whose sources TypeDoc cannot type-check
	(name) => name === "astro-config"
);
const pluginsApi = referencesFor(
	"plugins",
	PLUGINS.map(([slug]) => `holocron-plugin-${slug}`)
);
const cliApi = referencesFor("cli", ["cli", "astromech", "datapad"]);
const observabilityApi = referenceFor("observability");
const docsThemeApi = referenceFor("themes/docs-theme");

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
					observabilityApi.group,
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
					...CONFIGS.map((name) => {
						const api = configsApi.find((c) => c.name === name)?.api;
						return api
							? { label: name, items: [{ label: "Overview", slug: `configs/${name}` }, api.group] }
							: { label: name, slug: `configs/${name}` };
					}),
				],
			},
			{
				label: "Packages",
				items: [
					...cliApi.map(({ name, api }) => ({
						label: name,
						items: [{ label: "Overview", slug: name }, api.group],
					})),
					{ label: "comlink", slug: "comlink" },
					{ label: "sentinel", slug: "sentinel" },
				],
			},
			{
				label: "Themes",
				items: [
					{
						label: "docs-theme",
						items: [{ label: "Overview", slug: "themes/docs-theme" }, docsThemeApi.group],
					},
				],
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
					...PLUGINS.map(([slug, label], i) => ({
						label,
						items: [{ label: "Overview", slug: `plugins/${slug}` }, pluginsApi[i]!.api.group],
					})),
				],
			},
		],
	},
	plugins: [
		...[...utilsApi, ...clientsApi, ...configsApi, ...pluginsApi, ...cliApi].map(({ api }) => api.plugin),
		observabilityApi.plugin,
		docsThemeApi.plugin,
	],
	starlight,
	docsTheme,
	srcDir: "./docs/src",
	outDir: "./docs/dist",
	publicDir: "./docs/public",
});
