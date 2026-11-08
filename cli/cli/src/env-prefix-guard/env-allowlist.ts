/**
 * Bare environment variable names source may read without the `HOLOCRON_` prefix (#1864). A name is here because a
 * third party reads it itself (group 2 of `docs/src/content/docs/environment-variables.mdx`), so the bare name is the
 * contract, or because its move to the prefix is deferred (the list below). Add a name only for one of those reasons;
 * a name Holocron chooses is read through `holocronEnv()` or `resolveValue(names, env, { prefix })`.
 */
export const THIRD_PARTY_ENV_NAMES: ReadonlySet<string> = new Set([
	"CI",
	"DEBUG",
	// A convention many tools set for their own reasons; `environment.get()` reads it only after the Holocron names.
	"ENV",
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
 * Group 1 names whose move to the prefix is deferred. Only `RELEASE_GROUP` is left: the root `release.config.ts` reads it
 * raw on purpose (semantic-release loads it before a build) and each consumer repo's own release config reads it, so it
 * moves with the eight `*-template` repos. `ENVIRONMENT`, `AXIOM_ORG` and the GitHub App bindings (`SENTINEL_GITHUB_APP_ID`,
 * `SENTINEL_GITHUB_APP_PRIVATE_KEY`) have moved: they are read prefixed first, with the bare name as the fallback.
 */
export const DEFERRED_ENV_NAMES: ReadonlySet<string> = new Set(["RELEASE_GROUP"]);
