import type { RepoConfig } from "@theholocron/cli";

// The repository settings `holocron setup` and `holocron sync secrets` apply: teams, topics, Actions variables and
// the secrets to sync. `holocron.config.ts` keeps `repo.defaultBranch` (Sentinel needs it before it can know which
// branch to read `.holocron/` from) and the keys the preset gives (`protection`, `properties`): a key set there and
// here is an error. NAMES ONLY in this file: the directory is public, so no secret value goes here, ever.
// The import is type-only on purpose: Sentinel evaluates this file from the default branch, so it pulls in no runtime code.
export default {
	teams: [{ slug: "gatekeepers", permission: "maintain" }],
	topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
	// Organization Actions variables the reusable workflows read as `vars.NAME`. Their values are edited in the
	// `ci` layer of the 1Password Environments (`theholocron/holocron - ci`) and written by `holocron sync secrets --env ci`. Names only; a key blank or
	// missing in the Environment is skipped, so GitHub keeps its value.
	// A name here must not also be a literal in `variables.org`. Anything else already set in the org is left alone
	// (no `prune`). `doctor secrets` expects every key listed here at its scope.
	// HOLOCRON_CLOUDFLARE_PAGES_PROJECT is synced because every caller in this org shares one Pages project (`<org>-preview`, the
	// name the generated callers pass as `cloudflare-project`); a repo that needs a different project passes the
	// `cloudflare-project` input, which wins over the variable. HOLOCRON_POSTHOG_PROJECT_TOKEN is a publishable key, not a secret;
	// the CLI keeps its compiled-in key as the fallback for installed copies. HOLOCRON_SENTRY_DSN is a variable, not a secret: a
	// DSN is a public ingest key built to be embedded in client code; the CLI's telemetry reads it before `SENTRY_DSN`.
	// SENTINEL_GITHUB_APP_ID is public (shown on the App's settings page); the workflows read `vars.` first, then the old secret.
	variables: {
		sync: [
			{
				layer: "ci",
				scope: "org=theholocron",
				keys: [
					"HOLOCRON_AXIOM_DATASET",
					"HOLOCRON_CLOUDFLARE_ACCOUNT_ID",
					"HOLOCRON_CLOUDFLARE_PAGES_PROJECT",
					"HOLOCRON_POSTHOG_PROJECT_TOKEN",
					"HOLOCRON_SENTRY_DSN",
					"HOLOCRON_SENTRY_ORG",
					"HOLOCRON_TURBO_TEAM",
					"HOLOCRON_VERCEL_TEAM_ID",
					"SENTINEL_GITHUB_APP_ID",
				],
			},
		],
	},
	// The GitHub secrets the `ci` layer of the 1Password Environments fills (`holocron sync secrets --env ci`,
	// `theholocron/holocron - ci`, #1702, #2069): change one in 1Password, run the sync, and both scopes are updated. Names
	// only. A key that is blank in the Environment is skipped, so a placeholder never overwrites a working secret.
	// `doctor secrets` expects every key listed here at its scope.
	secrets: {
		sync: [
			// Organization secrets name who can read them (`repos`, visibility `selected`; never every repository, #2062).
			// Read by `holocron` and by the frozen reusables and actions in `.github`, which read them by these names.
			{
				layer: "ci",
				scope: "org=theholocron",
				repos: ["theholocron/holocron", "theholocron/.github"],
				keys: [
					"HOLOCRON_ADMIN_TOKEN",
					"HOLOCRON_AXIOM_TOKEN",
					"HOLOCRON_DEPLOY_TOKEN",
					"HOLOCRON_FERN_TOKEN",
					"HOLOCRON_ISSUES_TOKEN",
					"HOLOCRON_ORG_TOKEN",
					"HOLOCRON_READ_TOKEN",
					"HOLOCRON_RELEASE_TOKEN",
					"HOLOCRON_SYNC_TOKEN",
				],
			},
			// Read only by holocron's own reusable workflows.
			{
				layer: "ci",
				scope: "org=theholocron",
				repos: ["theholocron/holocron"],
				keys: [
					"HOLOCRON_CLOUDFLARE_TOKEN",
					"HOLOCRON_CODECOV_UPLOAD_TOKEN",
					"HOLOCRON_SENTRY_RELEASE_TOKEN",
					"HOLOCRON_TURBO_TOKEN",
					"SENTINEL_GITHUB_APP_PRIVATE_KEY",
				],
			},
			// The heartbeats' ping URLs (#2359), one per scheduled workflow, written by `holocron setup` to the `ci` layer's
			// import file. A repository secret: GitHub scopes a secret to a repository or an Environment, never to one
			// workflow, so every workflow of this repo that runs with secrets can read them. Someone with that access could
			// only mask a missed run (a URL accepts a ping and shows nothing), which is why no Environment is used.
			{
				layer: "ci",
				scope: "repo",
				keys: [
					"HOLOCRON_HEARTBEAT_CHECK_TOKENS",
					"HOLOCRON_HEARTBEAT_DOCTOR_TOKENS",
					"HOLOCRON_HEARTBEAT_RECONCILE_PROJECTS",
					"HOLOCRON_HEARTBEAT_SYNC_SPECS",
				],
			},
			{
				layer: "ci",
				keys: [
					"HOLOCRON_DEPLOYMENTS_TOKEN",
					"HOLOCRON_DISCORD_BOT_TOKEN",
					"HOLOCRON_OP_SERVICE_ACCOUNT_TOKEN",
					"HOLOCRON_SECRETS_TOKEN",
					"HOLOCRON_USER_SYNC_TOKEN",
					"HOLOCRON_VERCEL_PROTECTION_BYPASS_SECRET",
					"HOLOCRON_VERCEL_TOKEN",
				],
			},
		],
	},
	// The `area:<name>` labels (#2430, spec `tech-github-area-labels`): `holocron setup` makes them, `doctor repo` checks
	// them, and `areaLabelsForFiles()` / `areaLabelsForTitle()` (from `@theholocron/cli`) are the one mapping Sentinel and
	// the backfill probe read. `areas` is name to folder patterns (a `!` pattern takes a path out of the area, `docs/**`
	// less `docs/wiki/**`); a path in no area earns none (the root `package.json`, the lockfile, `scripts/`). `scopes` is
	// a title scope (`feat(sentinel)`) to an area, for issues, which have no changed files; a scope it does not name earns
	// nothing, so a topic scope such as `deps` or `monitoring` is left out on purpose. Names only.
	labels: {
		areas: {
			// One area for the five packages `cli`, `astromech`, `datapad`, `dagobah` and `kyber`.
			cli: ["cli/**"],
			sentinel: ["apps/sentinel/**"],
			comlink: ["apps/comlink/**"],
			council: ["apps/council/**"],
			plugins: ["plugins/**"],
			clients: ["clients/**"],
			configs: ["configs/**"],
			utils: ["utils/**"],
			observability: ["observability/**"],
			skills: ["skills/**", ".claude/skills/**"],
			themes: ["themes/**"],
			docs: ["docs/**", "!docs/wiki/**", "fern/**"],
			specs: ["docs/wiki/**", ".notes/**"],
			ci: ["ci/**", ".github/workflows/**"],
			// The root's own config: this file and its siblings in `.holocron/`, and the files the workspace is built from.
			tooling: [".holocron/**", "holocron.config.ts", "turbo.json", "pnpm-workspace.yaml", "eslint.config.ts"],
		},
		scopes: {
			cli: "cli",
			astromech: "cli",
			datapad: "cli",
			dagobah: "cli",
			kyber: "cli",
			sentinel: "sentinel",
			comlink: "comlink",
			council: "council",
			plugin: "plugins",
			plugins: "plugins",
			github: "plugins",
			linear: "plugins",
			clients: "clients",
			configs: "configs",
			utils: "utils",
			observability: "observability",
			skills: "skills",
			themes: "themes",
			docs: "docs",
			specs: "specs",
			ci: "ci",
			tooling: "tooling",
		},
	},
} satisfies RepoConfig;
