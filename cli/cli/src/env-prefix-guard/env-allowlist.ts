/**
 * Bare environment variable names source may read without the `HOLOCRON_` prefix (#1864). A name is here because a
 * third party reads it itself (group 2 of `docs/src/content/docs/environment-variables.mdx`), so the bare name is the
 * contract, or because its move to the prefix is a decision still open (the deferred list). Add a name only for one of
 * those reasons; a name Holocron chooses is read through `holocronEnv()` or `resolveValue(names, env, { prefix })`.
 */
export const THIRD_PARTY_ENV_NAMES: ReadonlySet<string> = new Set([
	"CI",
	"CODECOV_TOKEN",
	"DEBUG",
	"GH_TOKEN",
	"GITHUB_EVENT_NAME",
	"GITHUB_REF_NAME",
	"GITHUB_TOKEN",
	"NO_UPDATE_NOTIFIER",
	"NODE_ENV",
	"NPM_TOKEN",
	"PATH",
	"PATHEXT",
	"TURBO_SCM_BASE",
]);

/**
 * Group 1 names whose move to the prefix needs a decision (see the page above), so they are still read bare: the
 * `ENVIRONMENT` contract with the applications `holocron dev` starts, the release group the root `release.config.ts` and
 * each consumer repo's own release config read, and Sentinel's own bindings.
 */
export const DEFERRED_ENV_NAMES: ReadonlySet<string> = new Set([
	"AXIOM_ORG",
	"ENV",
	"ENVIRONMENT",
	"GITHUB_APP_ID",
	"GITHUB_APP_PRIVATE_KEY",
	"RELEASE_GROUP",
]);
