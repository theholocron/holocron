import { DOT_GITHUB_REPO, legacyFile, TEMPLATE_HOME } from "@theholocron/astromech";
import { createEnvLookup, type EnvLookup, PREFIX, withEnvPrefix } from "@theholocron/env-utils/lookup";

import { sentinelAxiomDataset } from "../sentinel-axiom-dataset/index.js";
import { sentinelCheckName } from "../sentinel-check-name/index.js";

/**
 * This App's brand name. No longer prefixed onto check-run names — GitHub's
 * own check-run detail page already shows the posting App's display name
 * ("The Holocron Sentinel") ahead of whatever name is set here, so a
 * hand-added "Sentinel /" prefix just duplicated it (found live: "The
 * Holocron Sentinel / Sentinel / Platform / ..."). Still used for anything
 * that isn't rendered next to GitHub's own App-name UI (log messages, etc).
 */
export const SENTINEL_APP_NAME = "Sentinel";

/**
 * `details_url` target for a check run Sentinel posts directly (no workflow
 * run behind it, unlike the dispatched check) — a permalink filtered to the
 * exact structured log line this check's own post logged, not a bare
 * dataset view (holocron#780, found live: capability-compliance and
 * commit-standards both linked the whole dataset with nothing to scope the
 * search to). `runId` is auto-bound to every line `createLogger()` emits
 * (Pino's `base` option) so it alone would work, but one webhook request
 * can post more than one check (capability compliance + commit standards
 * together) — `msg` (the exact string each one logs, matched with its own
 * post) disambiguates which of that request's lines is this one.
 *
 * The org slug and dataset are not compiled in: they come from `HOLOCRON_AXIOM_ORG` (else the bare `AXIOM_ORG`) and
 * `SENTINEL_AXIOM_DATASET` (else the bare `AXIOM_DATASET`, `sentinelAxiomDataset()`) through
 * `@theholocron/env-utils/lookup`, the path the logger takes too. Both are synced into Vercel from the
 * 1Password Environment `Sentinel`. Returns `undefined` (the check run then
 * has no details link) when either is unset, instead of a wrong link.
 */
export function sentinelAxiomLogUrl(
	runId: string,
	msg: string,
	env: EnvLookup = createEnvLookup()
): string | undefined {
	const org = withEnvPrefix(env, PREFIX).get("AXIOM_ORG");
	const dataset = sentinelAxiomDataset(env);
	if (!org || !dataset) return undefined;
	const apl = `['${dataset}'] | where runId == "${runId}" and msg == "${msg}"`;
	const initForm = JSON.stringify({ apl });
	return `https://app.axiom.co/${org}/query?initForm=${encodeURIComponent(initForm)}`;
}

/** Logged (and linked to) once `postCheckRun()` actually posts — never hand-copy this string elsewhere. */
export const SENTINEL_CAPABILITY_COMPLIANCE_LOG_MSG = "postCheckRun: posted";
/** Logged (and linked to) once `postCommitStandardsCheck()` actually posts — never hand-copy this string elsewhere. */
export const SENTINEL_COMMIT_STANDARDS_LOG_MSG = "postCommitStandardsCheck: posted";
/** Logged (and linked to) once `postDcoCheck()` actually posts — never hand-copy this string elsewhere. */
export const SENTINEL_DCO_LOG_MSG = "postDcoCheck: posted";
/** Logged (and linked to) once `postInclusiveLanguageCheck()` actually posts — never hand-copy this string elsewhere. */
export const SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG = "postInclusiveLanguageCheck: posted";
/** Logged (and linked to) once `postFormattingCheck()` actually posts — never hand-copy this string elsewhere. */
export const SENTINEL_FORMATTING_LOG_MSG = "postFormattingCheck: posted";
/** Logged once `commitFormattingFix()` actually commits a fix (holocron#820) — never hand-copy this string elsewhere. */
export const SENTINEL_FORMATTING_FIX_LOG_MSG = "commitFormattingFix: committed";
/** Logged (and linked to) once `postPrConfigValidationCheck()` actually posts (holocron#827) — never hand-copy this string elsewhere. */
export const SENTINEL_PR_CONFIG_VALIDATION_LOG_MSG = "postPrConfigValidationCheck: posted";
/** Logged (and linked to) once `postMarkdownLintCheck()` actually posts (holocron#821) — never hand-copy this string elsewhere. */
export const SENTINEL_MARKDOWN_LINT_LOG_MSG = "postMarkdownLintCheck: posted";
/** Logged once `commitMarkdownLintFix()` actually commits a fix — never hand-copy this string elsewhere. */
export const SENTINEL_MARKDOWN_LINT_FIX_LOG_MSG = "commitMarkdownLintFix: committed";
/** Logged (and linked to) once `postStaticAnalysisCheck()` actually posts (holocron#849) — never hand-copy this string elsewhere. */
export const SENTINEL_STATIC_ANALYSIS_LOG_MSG = "postStaticAnalysisCheck: posted";
/** Logged (and linked to) once `postActionlintCheck()` actually posts (holocron#904) — never hand-copy this string elsewhere. */
export const SENTINEL_ACTIONLINT_LOG_MSG = "postActionlintCheck: posted";
/** Logged (and linked to) once `postAdrsCheck()` actually posts (holocron#913) — never hand-copy this string elsewhere. */
export const SENTINEL_ADRS_LOG_MSG = "postAdrsCheck: posted";
/** Logged (and linked to) once `postDocsPresenceCheck()` actually posts (holocron#913) — never hand-copy this string elsewhere. */
export const SENTINEL_DOCS_PRESENCE_LOG_MSG = "postDocsPresenceCheck: posted";
/** Logged once per role-sync delivery, whatever its result (holocron#1595) — never hand-copy this string elsewhere. */
export const SENTINEL_ROLE_SYNC_LOG_MSG = "runRoleSync: finished";
/** Logged once per #prs feed delivery, whatever its result (holocron#1833) — never hand-copy this string elsewhere. */
export const SENTINEL_PR_FEED_LOG_MSG = "runPrFeed: finished";
/** The one check run whose completion tells the #prs feed how CI went: the `ci` aggregate (holocron#1613). Other check runs are dropped before anything is fetched. */
export const SENTINEL_PR_FEED_CHECK_NAME = "ci / Required checks";
/** Logged (and linked to) once `postEditorConfigCheck()` actually posts — never hand-copy this string elsewhere. */
export const SENTINEL_EDITORCONFIG_LOG_MSG = "postEditorConfigCheck: posted";
/** Logged once `commitEditorConfigFix()` actually commits a fix — never hand-copy this string elsewhere. */
export const SENTINEL_EDITORCONFIG_FIX_LOG_MSG = "commitEditorConfigFix: committed";

/**
 * Where the Bucket 2 dispatch mechanism's shared workflow lives
 * (holocron#769, holocron#794, `tech-sentinel-ci-runner.spec.md`) — one
 * `workflow_dispatch`-triggered workflow in `theholocron/.github`, always
 * dispatched against its own default branch. Never the *target* repo the
 * dispatch checks out — that's a per-call `repo`/`ref` input, not this.
 */
export const SENTINEL_DISPATCH_REPO = DOT_GITHUB_REPO;
/** The old file name of the `check-dispatched` reusable: the frozen copy in `.github` keeps it, and Sentinel dispatches it by name. */
export const SENTINEL_DISPATCH_WORKFLOW_FILE = legacyFile("check-dispatched.yml");
/** The frozen home's ref, from astromech's `ci-ref` (not `CI_HOME`, which follows the reusables when they move). */
export const SENTINEL_DISPATCH_REF = TEMPLATE_HOME.ref;

/**
 * The one Bucket 2 task this prototype phase dispatches (holocron#769,
 * `tech-sentinel-ci-runner.spec.md`'s explicit scope: "one Bucket 2 tool
 * prototype against tsc"). Only fires for a repo whose `holocron.config`
 * actually declares this task — every other repo is untouched. Runs
 * *alongside* the existing GitHub Actions thin-caller for the same task,
 * not instead of it, until this mechanism is trusted enough to replace it.
 *
 * Check name matches the same `Group / Action` shape every other
 * Sentinel-posted check uses (`sentinelCheckName()`), and mirrors the native
 * thin-caller check's own command name ("Run tsc --noEmit") for a task that
 * only ever has one dispatchable command today.
 */
export const SENTINEL_DISPATCHABLE_TASK = "verification.typeSafety";
/**
 * The astromech task whose checks the repo-validation pipeline mirrors
 * (holocron#913) — `Validate ADRs and specs` and `Validate docs presence`
 * only run for a repo whose valid config declares it, the same gate the
 * Bucket 2 dispatch uses for `SENTINEL_DISPATCHABLE_TASK`.
 */
export const SENTINEL_REPO_VALIDATION_TASK = "platform.repoValidation";
export const SENTINEL_DISPATCHED_CHECK_NAME = sentinelCheckName("Type Safety", "Run tsc --noEmit");
