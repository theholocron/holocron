import type { RepoConfig } from "@theholocron/cli";

// The repository settings `holocron repo setup` and `holocron secrets sync` apply: teams, topics, Actions variables and
// the secrets to sync. `holocron.config.ts` keeps `repo.defaultBranch` (Sentinel needs it before it can know which
// branch to read `.holocron/` from) and the keys the preset gives (`protection`, `properties`): a key set there and
// here is an error. NAMES ONLY in this file: the directory is public, so no secret value goes here, ever.
// The import is type-only on purpose: Sentinel evaluates this file from the default branch, so it pulls in no runtime code.
export default {
	teams: [{ slug: "gatekeepers", permission: "maintain" }],
	topics: ["automation", "cli", "developer-tools", "holocron", "nodejs", "typescript"],
	// Organization Actions variables the reusable workflows read as `vars.NAME`. Their values are edited in the
	// 1Password Environment `Holocron - GitHub Actions variables` (a separate Environment from the secrets one, because
	// 1Password does not tell a visible value from a secret) and written by `holocron secrets sync "Holocron - GitHub
	// Actions variables"`. Names only; a key blank or missing in the Environment is skipped, so GitHub keeps its value.
	// A name here must not also be a literal in `variables.org`. Anything else already set in the org is left alone
	// (no `prune`). `doctor variables` expects every key listed here at its scope.
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
					"HOLOCRON_AXIOM_ORG",
					"HOLOCRON_CLOUDFLARE_ACCOUNT_ID",
					"HOLOCRON_CLOUDFLARE_PAGES_PROJECT",
					"HOLOCRON_POSTHOG_PROJECT_TOKEN",
					"HOLOCRON_SENTRY_DSN",
					"HOLOCRON_SENTRY_ORG",
					"HOLOCRON_TURBO_TEAM",
					"HOLOCRON_VERCEL_TEAM_ID",
					"SENTINEL_AXIOM_DATASET",
					"SENTINEL_GITHUB_APP_ID",
				],
			},
		],
	},
	// The GitHub secrets the `ci` layer of the 1Password Environments fills (`holocron secrets sync ci`,
	// `theholocron/holocron - ci`, #1702, #2069): change one in 1Password, run the sync, and both scopes are updated. Names
	// only. A key that is blank in the Environment is skipped, so a placeholder never overwrites a working secret.
	// `doctor secrets` expects every key listed here at its scope.
	secrets: {
		sync: [
			{
				layer: "ci",
				scope: "org=theholocron",
				keys: [
					"HOLOCRON_ADMIN_TOKEN",
					"HOLOCRON_AXIOM_TOKEN",
					"HOLOCRON_CLOUDFLARE_TOKEN",
					"HOLOCRON_CODECOV_TOKEN",
					"HOLOCRON_DEPLOY_TOKEN",
					"HOLOCRON_FERN_TOKEN",
					"HOLOCRON_ISSUES_TOKEN",
					"HOLOCRON_ORG_TOKEN",
					"HOLOCRON_READ_TOKEN",
					"HOLOCRON_RELEASE_TOKEN",
					"HOLOCRON_SENTRY_AUTH_TOKEN",
					"HOLOCRON_SYNC_TOKEN",
					"HOLOCRON_TURBO_TOKEN",
					"SENTINEL_GITHUB_APP_PRIVATE_KEY",
				],
			},
			{
				layer: "ci",
				keys: [
					"HOLOCRON_DEPLOYMENTS_TOKEN",
					"HOLOCRON_DISCORD_BOT_TOKEN",
					"HOLOCRON_SECRETS_TOKEN",
					"HOLOCRON_VERCEL_PROTECTION_BYPASS_SECRET",
					"HOLOCRON_VERCEL_TOKEN",
					"SENTINEL_OP_SERVICE_ACCOUNT_TOKEN",
				],
			},
		],
	},
} satisfies RepoConfig;
