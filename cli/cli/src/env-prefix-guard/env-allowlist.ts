/**
 * Bare environment variable names source may read without the `HOLOCRON_` prefix (#1864). A name is here because a
 * third party reads it itself (group 2 of `docs/src/content/docs/environment-variables.mdx`), so the bare name is the
 * contract, or because its move to the prefix is deferred (the list below). Add a name only for one of those reasons;
 * a name Holocron chooses is read through `holocronEnv()` or `resolveValue(names, env, { prefix })`.
 */
export const THIRD_PARTY_ENV_NAMES: ReadonlySet<string> = new Set([
	"CI",
	// What Codecov's own uploader reads; the vite-config preset falls back to it after `HOLOCRON_CODECOV_UPLOAD_TOKEN`.
	// It cannot go through `holocronEnv()`, which would also read the prefixed name of a different credential.
	"CODECOV_TOKEN",
	// What Vercel sends as `Authorization: Bearer <value>` on a cron call when the project has the variable; Sentinel's `/api/scheduled` checks it.
	"CRON_SECRET",
	"DEBUG",
	// A convention many tools set for their own reasons; `environment.get()` reads it only after the Holocron names.
	"ENV",
	"GH_TOKEN",
	"GITHUB_EVENT_NAME",
	// The file GitHub Actions names for a step's outputs; `upload coverage` appends `uploaded=<n>` to it.
	"GITHUB_OUTPUT",
	"GITHUB_REF_NAME",
	// The file GitHub Actions names for a job's Markdown summary; `publish package` appends the packages that did not publish.
	"GITHUB_STEP_SUMMARY",
	"GITHUB_TOKEN",
	"NO_UPDATE_NOTIFIER",
	"NODE_ENV",
	"NPM_TOKEN",
	"PATH",
	"PATHEXT",
	// The user's login shell, set by the system; the Council plugin reads it as a fallback (apps/council).
	"SHELL",
	"TURBO_SCM_BASE",
]);

/**
 * Group 1 names whose move to the prefix is deferred. Only `RELEASE_GROUP` is left: the root `release.config.ts` reads it
 * raw on purpose (semantic-release loads it before a build) and each consumer repo's own release config reads it, so it
 * moves with the eight `*-template` repos. `ENVIRONMENT`, `AXIOM_ORG` and the GitHub App bindings (`SENTINEL_GITHUB_APP_ID`,
 * `SENTINEL_GITHUB_APP_PRIVATE_KEY`) have moved: they are read prefixed first, with the bare name as the fallback.
 */
export const DEFERRED_ENV_NAMES: ReadonlySet<string> = new Set(["RELEASE_GROUP"]);

/**
 * The bare names of group 1 of `docs/src/content/docs/environment-variables.mdx`: Holocron's own variables, read as
 * `HOLOCRON_<NAME>` and then `<NAME>`. `scanPrefixedOnlyReads()` fails a source file that reads one of them in its
 * prefixed spelling only, because that drops the bare fallback. `RELEASE_GROUP` is left out (deferred, read bare), and
 * the `GOOGLE_*` names are not listed one by one: google-client reads them through the prefix helper.
 */
export const GROUP_ONE_ENV_NAMES: ReadonlySet<string> = new Set([
	"AXIOM_DATASET",
	"AXIOM_ORG",
	"BASE_SHA",
	"CLOUDFLARE_ACCOUNT_ID",
	"ENVIRONMENT",
	"IDEAS_DIR",
	"PORT",
	"POSTHOG_HOST",
	"POSTHOG_PROJECT_TOKEN",
	"PR_BODY",
	"PR_TITLE",
	"SENTRY_DSN",
	"VERCEL_PROTECTION_BYPASS_SECRET",
	"VERCEL_TEAM_ID",
]);
