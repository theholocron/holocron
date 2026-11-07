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
	// CLOUDFLARE_PAGES_PROJECT is synced because every caller in this org shares one Pages project (`<org>-preview`, the
	// name the generated callers pass as `cloudflare-project`); a repo that needs a different project passes the
	// `cloudflare-project` input, which wins over the variable. POSTHOG_PROJECT_TOKEN is a publishable key, not a secret;
	// the CLI keeps its compiled-in key as the fallback for installed copies.
	variables: {
		sync: [
			{
				environment: "Holocron - GitHub Actions variables",
				scope: "org=theholocron",
				keys: [
					"CLOUDFLARE_ACCOUNT_ID",
					"CLOUDFLARE_PAGES_PROJECT",
					"HOLOCRON_AXIOM_DATASET",
					"POSTHOG_PROJECT_TOKEN",
					"SENTRY_ORG",
					"TURBO_TEAM",
					"VERCEL_TEAM_ID",
				],
			},
		],
	},
	// The GitHub secrets the 1Password Environment `Holocron - GitHub Actions` fills (`holocron secrets sync
	// "Holocron - GitHub Actions"`, #1702): change one in 1Password, run the sync, and both scopes are updated. Names
	// only. A key that is blank in the Environment is skipped, so a placeholder never overwrites a working secret.
	// `doctor secrets` expects every key listed here at its scope.
	secrets: {
		sync: [
			{
				environment: "Holocron - GitHub Actions",
				scope: "org=theholocron",
				keys: [
					"AXIOM_TOKEN",
					"CLOUDFLARE_API_TOKEN",
					"CODECOV_TOKEN",
					"FERN_TOKEN",
					"HOLOCRON_ADMIN_TOKEN",
					"HOLOCRON_DEPLOY_TOKEN",
					"HOLOCRON_ISSUES_TOKEN",
					"HOLOCRON_ORG_TOKEN",
					"HOLOCRON_READ_TOKEN",
					"HOLOCRON_RELEASE_TOKEN",
					"HOLOCRON_SYNC_TOKEN",
					"LHCI_GITHUB_APP_TOKEN",
					"SENTINEL_APP_ID",
					"SENTINEL_APP_PRIVATE_KEY",
					"SENTRY_AUTH_TOKEN",
					"STORYBOOK_CODE_SANDBOX_API_TOKEN",
					"SUPER_LINTER_APP_ID",
					"SUPER_LINTER_GPG_PASSPHRASE",
					"SUPER_LINTER_GPG_PRIVATE_KEY",
					"SUPER_LINTER_PRIVATE_KEY",
					"TURBO_TOKEN",
				],
			},
			{
				environment: "Holocron - GitHub Actions",
				keys: [
					"HOLOCRON_DEPLOYMENTS_TOKEN",
					"HOLOCRON_DISCORD_BOT_TOKEN",
					"HOLOCRON_SECRETS_TOKEN",
					"NEXT_PUBLIC_SENTRY_DSN",
					"SENTINEL_OP_SERVICE_ACCOUNT_TOKEN",
					"SENTRY_DSN",
					"VERCEL_PROTECTION_BYPASS_SECRET",
					"VERCEL_TOKEN",
				],
			},
		],
	},
} satisfies RepoConfig;
