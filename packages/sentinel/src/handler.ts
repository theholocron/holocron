/**
 * The webhook receiver's core logic — wires several independent check
 * pipelines into a single Fetch-API request handler, all through an
 * installation-scoped `GitHubClient` (D10: the installation id always
 * comes from the webhook payload itself, never hardcoded, so one App
 * registration handles installations across any number of orgs/accounts
 * unchanged):
 *
 * - **Capability compliance** (`validateConfig → syncPropertiesFromConfig
 *   → postCheckRun`): `push.default-branch` and `pull_request.*` both run
 *   it (same engine, D8 — only the commit SHA the check run attaches to
 *   differs), but only when `validateConfig()` reports `"valid"` — a
 *   missing/broken config is acknowledged without posting a check run.
 * - **Commit standards** (`lintCommits → postCommitStandardsCheck`,
 *   holocron#769/#771): `pull_request.*` only — a push has no PR commits
 *   to fetch. Config-free by design (D6,
 *   `.notes/tech-sentinel-enforcement.spec.md`) — runs independent of
 *   `validateConfig()`'s result, since it never reads `holocron.config.ts`
 *   at all.
 * - **Inclusive language** (`lintInclusiveLanguage → postInclusiveLanguageCheck`,
 *   holocron#769/#793): `pull_request.*` only, same reason as commit
 *   standards — needs the PR's own changed-files list. Config-free in the
 *   same sense: reads the org's canonical `ALEX_CONFIG` directly, never a
 *   per-repo file. **Not purely advisory** (holocron#865 follow-up):
 *   `conclusion: "failure"` the moment any finding is `retext-equality`
 *   (gendered/insensitive phrasing — org policy decided per-plugin, not
 *   per-word) or high-confidence `retext-profanities` — a real
 *   merge-blocker. Only a low-confidence profanity guess (`cuss`'s own
 *   sureness rating) stays `"neutral"`/advisory.
 * - **Formatting** (`lintFormatting → postFormattingCheck`,
 *   holocron#769/#819): `pull_request.*` only, same config-free shape as
 *   inclusive language, but purely advisory unlike it — reads
 *   `@theholocron/prettier-config`'s canonical export directly, never a
 *   per-repo file.
 * - **Editorconfig** (`lintEditorConfig → postEditorConfigCheck`):
 *   `pull_request.*` only, reads the repo's own `.editorconfig` from the
 *   PR's head ref (a real per-repo file — the only Bucket 1 check that
 *   reads one — since `.editorconfig` conventionally lives per-repo, not
 *   as a shared org config). Unlike formatting, `conclusion: "failure"`
 *   on any violation — but every property it checks is also auto-fixed
 *   (`commitEditorConfigFix`, part of the same auto-fix-commit gate below
 *   formatting's own fix uses) in the same handler invocation, so a
 *   failure here is meant to be transient: the fix commit's own push
 *   fires a fresh webhook that supersedes it with a passing check. A
 *   failure that survives means `indent_style`'s best-effort fix couldn't
 *   safely resolve it — see `lint-editorconfig.ts`'s own module docstring
 *   for why the value-checking/fixing logic is a deliberate, narrow
 *   reimplementation (no real importable library exists for either, unlike
 *   every other check).
 * - **Documentation** (`lintMarkdown → postMarkdownLintCheck`,
 *   holocron#769/#821): `pull_request.*` only, same reason and same
 *   config-free shape as the other three Bucket 1 checks — reads
 *   `@theholocron/markdownlint-config`'s canonical export directly, never
 *   a per-repo file. One `markdownlint.lint()` call batching every
 *   changed markdown file's content, not a per-file loop the way
 *   prettier/alex run. **Not purely check-run advisory** (holocron#860):
 *   an error-severity finding (markdownlint's own per-rule `severity`,
 *   `"error"` by default until `@theholocron/markdownlint-config` curates
 *   individual rules down to `"warning"`) posts as an inline PR review
 *   comment instead of a check-run annotation — see `postErrorReview()`.
 *   The check run's own `conclusion` is unaffected; only where the
 *   finding surfaces changes. Also backed by auto-fix-commit below
 *   (`commitMarkdownLintFix`) via `markdownlint`'s own `applyFixes()` —
 *   independent of severity, since a fix is either deterministically
 *   possible or it isn't (see `lint-markdown.ts`'s own module docstring
 *   for why most of the rules that would otherwise overlap with
 *   Prettier are disabled in this org's config, narrowing what's left to
 *   auto-fix).
 * - **Static analysis** (`lintStaticAnalysis → postStaticAnalysisCheck`,
 *   holocron#769/#849): `pull_request.*` only, same reason and same
 *   check-run shape as the other Bucket 1 checks — reads
 *   `@theholocron/eslint-config`'s `library()` bundle directly, via
 *   eslint's real `Linter.verify()` API against fetched file content, no
 *   checkout. **Not** config-free like its four siblings, though — skipped
 *   entirely when this repo's `runtime_environment` property (resolved by
 *   capability compliance's `syncPropertiesFromConfig()` call above, reused
 *   here rather than refetched) is explicitly `"none"`, since a docs-only
 *   repo has no JS/TS to lint at all. Same **not purely check-run
 *   advisory** treatment as Documentation above (holocron#860) — an
 *   error-severity eslint finding posts as a PR review comment via the
 *   same shared `postErrorReview()`, scoped separately so a re-push never
 *   resolves the sibling check's own threads.
 * - **actionlint** (`lintActionlint → postActionlintCheck`, holocron#904):
 *   `pull_request.*` only, the actionlint half of the same
 *   `sourceQuality.staticAnalysis` task as static analysis above, but
 *   config-free unlike it — any repo can carry workflow files, so no
 *   `runtime_environment` gate. Real actionlint and real ShellCheck (over
 *   every step's `run:` script, the integration the actionlint binary gets
 *   from a `shellcheck` on PATH), both as WASM against fetched workflow
 *   content, no checkout. Same error-review / warning-annotation split as
 *   static analysis, via the same shared `postErrorReview()` under its own
 *   `checkKey`.
 * - **Repo validation** (`validateAdrs → postAdrsCheck`,
 *   `validateDocsPresence → postDocsPresenceCheck`, holocron#913;
 *   `validateRegistry → postRegistryCheck`, holocron#925):
 *   `pull_request.*` only, and only for a repo whose valid config declares
 *   `platform.repoValidation` -- Sentinel's ports of that task's three CI
 *   jobs, kept as three separate checks. ADR/spec frontmatter errors and
 *   unregistered packages fail and post a PR review (same
 *   `postErrorReview()` split as eslint/actionlint); docs presence is
 *   advisory only (`neutral` at worst), like the script it ports.
 * - **Bucket 2 dispatch** (`dispatchCheck`, holocron#769/#794,
 *   `tech-sentinel-ci-runner.spec.md`): fires for both event types, same as
 *   capability compliance, but only when the repo's *valid* config declares
 *   `SENTINEL_DISPATCHABLE_TASK` — one hardcoded task for this prototype
 *   phase, not a general Bucket-2-task sweep. Runs *alongside* the existing
 *   GitHub Actions thin-caller for that same task, not instead of it, until
 *   this mechanism is trusted enough to replace it.
 * - **PR Config Validation** (`validateConfig` against the PR's own head
 *   ref, holocron#827): posted as `Platform / Compliance / Run Holocron
 *   config compatibility (pull_request)` — a "(pull_request)" suffix, not
 *   a distinct name; the same Run Holocron config compatibility concept,
 *   just validated against the PR's own branch. Advisory, never required,
 *   deliberately separate from the default-branch check below — a PR
 *   proposing a new task/provider gets real feedback on whether
 *   `holocron.config.ts` still parses and
 *   declares only known tasks *immediately*, rather than only after
 *   merge. `pull_request.*` only. Hoisted (not scoped to its own try) so
 *   the auto-fix-commit gate further down reuses this same PR-branch read
 *   instead of fetching it a second time.
 * - **Auto-fix-commit** (`commitFormattingFix` + `commitEditorConfigFix` +
 *   `commitMarkdownLintFix`, holocron#820): the one exception to every
 *   check above being config-free — writing to repo content is
 *   qualitatively different from reading and reporting. All three actions
 *   share one gate and one opt-out, since all three checks are already
 *   bundled under the same `sourceQuality.formatting` task (astromech's
 *   registry `linterGroup`: prettier, editorconfig, markdownlint) — there's
 *   no separate `autoFix` flag to track per sub-check. Default-on
 *   (holocron#864 follow-up: every fix is mechanical and deterministic,
 *   so there's no human judgment call for a finding to surface in the
 *   first place); opt out via `{ name: "sourceQuality.formatting", with: {
 *   autoFix: false } }` in `holocron.config.ts`'s `tasks` array. Reuses PR
 *   Config Validation's own PR-branch read above — the PR's own branch
 *   gets the final say when it declares an explicit value (letting a PR
 *   opt itself in or out before that same config change merges to main);
 *   the merged config's explicit value is the fallback. Each action fires
 *   independently when not opted out *and* its own lint step actually
 *   found something to fix — reusing `lintFormatting()`'s/
 *   `lintEditorConfig()`'s/`lintMarkdown()`'s already-computed fixed
 *   output rather than re-running prettier/re-resolving `.editorconfig`/
 *   re-linting markdown. Up to three atomic commits (one per check, since
 *   each can independently disagree about whether a fix was even
 *   possible) via the Git Data API (blob → tree → commit → ref-update),
 *   each pushed directly onto the PR's own head branch. Requires
 *   `Contents: Write` — see the README's permissions table. **Trade-off,
 *   not a bug**: each commit is a new push, so it retriggers the full
 *   required-checks suite again — real CI cost and merge latency for any
 *   PR that needed fixing.
 * - **Auto-fix PR comment** (`postAutoFixComment`, holocron#674/#834):
 *   explains what the commit above just changed — which files, and the
 *   commit SHA. Fires only when `commitFormattingFix` actually committed
 *   (nothing to say otherwise). Uses `issues.createComment()` — requires
 *   `Issues: Write`, a second permission escalation alongside auto-fix-
 *   commit's own `Contents: Write`; see the README's permissions table.
 *   Its own soft-skip is independent of the commit's: a comment failure
 *   must never make an otherwise-successful auto-fix commit look like it
 *   failed too.
 *
 * Deliberately platform-agnostic: a plain `(Request, Env) => Response`
 * function, no framework, no deploy-target-specific wrapper. A thin
 * per-platform adapter — wiring this to the deploy target's actual
 * entry-point convention and reading its real secrets into `Env` — is
 * the still-open "Sentinel's own holocron.config.ts" PR-stack item.
 *
 * `Env` fields this handler expects, wired via `holocron secrets sync`
 * (holocron#781) from Doppler's `sentinel`/`prd` config: `GITHUB_APP_ID`,
 * `GITHUB_APP_PRIVATE_KEY`, `SENTINEL_WEBHOOK_SECRET`. The module-level
 * logger below reads two more via `@theholocron/env-utils` (see its own
 * comment — never bare `process.env`, this org's own convention) — not
 * through this `Env` parameter, since it's built once at module load,
 * before any request (and its `env`) exists.
 *
 * v1 scope only: `installation.created`/`installation.deleted` are
 * acknowledged, not acted on — no per-installation action is defined yet.
 *
 * Deploy target: Vercel Functions (Node.js runtime), not Cloudflare
 * Workers — reversed from the spec's earlier "Resolved" call once
 * building this surfaced why: `validateConfig()` writes a fetched
 * config to a temp file and dynamically `import()`s it (so a real
 * `holocron.config.ts` with `import { defineConfig } from
 * "@theholocron/cli"` actually executes) — that needs a real
 * filesystem and real dynamic `import()`, neither of which Workers'
 * isolate model has, `nodejs_compat` or not. Vercel's Node.js runtime
 * has both natively; this handler's own logic needed no changes.
 */

import { normalizeTaskEntry } from "@theholocron/astromech/config";
import { createEnvLookup } from "@theholocron/env-utils";
import { createInstallationClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";
import { createLogger } from "@theholocron/observability/logger";

import { lintActionlint } from "./actions/actionlint/lint-actionlint.js";
import { postActionlintCheck } from "./actions/actionlint/post-actionlint-check.js";
import { postCheckRun } from "./actions/capability-compliance/post-check-run.js";
import { syncPropertiesFromConfig } from "./actions/capability-compliance/sync-properties.js";
import { lintCommits } from "./actions/commit-standards/lint-commits.js";
import { postCommitStandardsCheck } from "./actions/commit-standards/post-commit-standards-check.js";
import { lintDco } from "./actions/dco/lint-dco.js";
import { postDcoCheck } from "./actions/dco/post-dco-check.js";
import { dispatchCheck } from "./actions/dispatched-check/dispatch-check.js";
import { commitEditorConfigFix } from "./actions/editorconfig/commit-editorconfig-fix.js";
import { lintEditorConfig, type LintEditorConfigResult } from "./actions/editorconfig/lint-editorconfig.js";
import { postEditorConfigCheck } from "./actions/editorconfig/post-editorconfig-check.js";
import { commitFormattingFix } from "./actions/formatting/commit-formatting-fix.js";
import { lintFormatting, type LintFormattingResult } from "./actions/formatting/lint-formatting.js";
import { postAutoFixComment } from "./actions/formatting/post-auto-fix-comment.js";
import { postFormattingCheck } from "./actions/formatting/post-formatting-check.js";
import { lintInclusiveLanguage } from "./actions/inclusive-language/lint-inclusive-language.js";
import { postInclusiveLanguageCheck } from "./actions/inclusive-language/post-inclusive-language-check.js";
import { commitMarkdownLintFix } from "./actions/markdown-lint/commit-markdown-lint-fix.js";
import { lintMarkdown, type LintMarkdownResult } from "./actions/markdown-lint/lint-markdown.js";
import { postMarkdownLintCheck } from "./actions/markdown-lint/post-markdown-lint-check.js";
import { postPrConfigValidationCheck } from "./actions/pr-config-validation/post-pr-config-validation-check.js";
import { loadLatestRegistry } from "./actions/repo-validation/load-latest-registry.js";
import { postAdrsCheck } from "./actions/repo-validation/post-adrs-check.js";
import { postDocsPresenceCheck } from "./actions/repo-validation/post-docs-presence-check.js";
import { postRegistryCheck } from "./actions/repo-validation/post-registry-check.js";
import { validateAdrs } from "./actions/repo-validation/validate-adrs.js";
import { validateDocsPresence } from "./actions/repo-validation/validate-docs-presence.js";
import { validateRegistry } from "./actions/repo-validation/validate-registry.js";
import { lintStaticAnalysis } from "./actions/static-analysis/lint-static-analysis.js";
import { postStaticAnalysisCheck } from "./actions/static-analysis/post-static-analysis-check.js";
import {
	SENTINEL_ACTIONLINT_LOG_MSG,
	SENTINEL_ADRS_LOG_MSG,
	SENTINEL_CAPABILITY_COMPLIANCE_LOG_MSG,
	SENTINEL_COMMIT_STANDARDS_LOG_MSG,
	SENTINEL_DCO_LOG_MSG,
	SENTINEL_DISPATCHABLE_TASK,
	SENTINEL_DISPATCHED_CHECK_NAME,
	SENTINEL_DOCS_PRESENCE_LOG_MSG,
	SENTINEL_EDITORCONFIG_FIX_LOG_MSG,
	SENTINEL_EDITORCONFIG_LOG_MSG,
	SENTINEL_FORMATTING_FIX_LOG_MSG,
	SENTINEL_FORMATTING_LOG_MSG,
	SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG,
	SENTINEL_MARKDOWN_LINT_FIX_LOG_MSG,
	SENTINEL_MARKDOWN_LINT_LOG_MSG,
	SENTINEL_PR_CONFIG_VALIDATION_LOG_MSG,
	SENTINEL_REGISTRY_LOG_MSG,
	SENTINEL_REPO_VALIDATION_TASK,
	SENTINEL_STATIC_ANALYSIS_LOG_MSG,
} from "./utils/constants.js";
import { validateConfig, type ValidateConfigResult } from "./utils/validate-config.js";
import { parseWebhookEvent, type SentinelEvent, WebhookVerificationError } from "./utils/webhook.js";

// Explicit token, not createLogger()'s own AXIOM_TOKEN auto-detection
// (holocron#780/#781): SENTINEL_AXIOM_INGEST_TOKEN is a separate,
// narrower-scoped (ingest-only) token, deliberately distinct from
// whatever a broader AXIOM_TOKEN might mean elsewhere in this org — using
// the generic auto-detected name here would silently widen the
// credential this deployment actually needs. Falls back to no Axiom
// transport (not a throw) when either var is unset, matching
// createLogger()'s own "absent → no transport" contract — true in every
// test run, and in any environment before the two Doppler-sourced values
// have been synced to Vercel. `runId` is threaded into every check run's
// own output.text so a viewer can find the exact invocation's structured
// log line in Axiom without leaving GitHub.
const env = createEnvLookup();
const axiomToken = env.get("SENTINEL_AXIOM_INGEST_TOKEN");
const axiomDataset = env.get("AXIOM_DATASET");
const { logger, runId } = createLogger(
	axiomToken && axiomDataset ? { axiom: { token: axiomToken, dataset: axiomDataset } } : {}
);

export interface Env {
	GITHUB_APP_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	SENTINEL_WEBHOOK_SECRET: string;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * `ProviderApiError.details` is a raw response-body string (per this org's
 * own convention — never parsed JSON), not part of the base `Error`
 * interface, so a plain `{ message, stack }` log silently drops the actual
 * validation error GitHub sent back. Included whenever present, alongside
 * `status` — the two together are what actually explain a 4xx/5xx, not the
 * generic templated `.message` ("GitHub PATCH ... → 422") on its own.
 */
function serializeError(err: unknown): Record<string, unknown> | string {
	if (err instanceof ProviderApiError) {
		return { message: err.message, status: err.status, details: err.details, stack: err.stack };
	}
	if (err instanceof Error) {
		return { message: err.message, stack: err.stack };
	}
	return String(err);
}

/** The push/pull_request-specific fields the pipeline needs beyond what `SentinelEvent` already normalizes. */
interface ResolutionContext {
	defaultBranch: string;
	headSha: string;
	/** Only present for `pull_request.*` events — `lintCommits()`'s own input. `push.default-branch` has no PR to fetch commits from. */
	pullNumber?: number;
	/** Only present for `pull_request.*` events — the PR's head *branch name*, not a SHA. `commitFormattingFix()`'s own `updateRef()` input (holocron#820); nothing else needs it. */
	headRef?: string;
}

/**
 * Reads `defaultBranch`, the commit SHA to check, and (for `pull_request.*`
 * events) the PR number from `event.raw` — `SentinelEvent`'s normalized
 * shape doesn't carry any of these, since `postCheckRun`/
 * `syncPropertiesFromConfig`/`lintCommits` are the only consumers that
 * need them, and `webhook.ts`'s own job stops at "which event category,
 * which repo, which installation" (see its own module docstring).
 */
function resolutionContext(event: SentinelEvent): ResolutionContext {
	const raw = event.raw as {
		repository?: { default_branch?: string };
		after?: string;
		pull_request?: { number?: number; head?: { sha?: string; ref?: string } };
	};
	const defaultBranch = raw.repository?.default_branch;
	const headSha = event.type === "push.default-branch" ? raw.after : raw.pull_request?.head?.sha;
	if (!defaultBranch || !headSha) {
		throw new WebhookVerificationError(
			`${event.type}: payload missing repository.default_branch or the commit SHA to check`
		);
	}
	return {
		defaultBranch,
		headSha,
		pullNumber: raw.pull_request?.number,
		headRef: raw.pull_request?.head?.ref,
	};
}

/** Handles one inbound webhook request. Platform adapters call this directly — no `{ fetch }` wrapper required. */
export async function handleWebhookRequest(request: Request, env: Env): Promise<Response> {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405 });
	}

	try {
		return await handle(request, env);
	} catch (err) {
		// The read-only-filesystem ENOENT crash (validateConfig writing outside
		// os.tmpdir()) previously reached here with nothing observable at all --
		// a bare 500, no log line, no stack trace anywhere. Log first, then
		// still respond 500 (this is a genuine unhandled failure, not a
		// recognized "config didn't validate" case above).
		logger.error({ err: serializeError(err) }, "handleWebhookRequest: unhandled error");
		return json({ handled: false, reason: "internal error" }, 500);
	} finally {
		// Axiom's transport runs on a worker thread -- a line logged above is
		// only *enqueued*, not yet sent, when the try/catch above returns.
		// Vercel can freeze this Lambda right after the Response goes out, so
		// without this the buffered lines (including the one unhandled-error
		// line above) silently never reach Axiom at all. `finally`'s own
		// `await` delays the function's real return until the flush settles.
		// A flush failure is itself just an observability gap, never a reason
		// to turn an otherwise-successful response into a 500.
		try {
			await logger.flush();
		} catch (err) {
			console.error("handleWebhookRequest: logger.flush() failed", err);
		}
	}
}

async function handle(request: Request, env: Env): Promise<Response> {
	const body = await request.text();
	const headers = Object.fromEntries(request.headers);

	let result;
	try {
		result = parseWebhookEvent({ body, headers, secret: env.SENTINEL_WEBHOOK_SECRET });
	} catch (err) {
		if (err instanceof WebhookVerificationError) {
			return new Response(err.message, { status: 401 });
		}
		throw err;
	}

	if (!result.handled) {
		return json({ handled: false, reason: result.reason });
	}

	const { event } = result;
	if (event.type === "installation.created" || event.type === "installation.deleted") {
		return json({ handled: true, type: event.type });
	}

	const repo = event.repo;
	if (!repo) {
		// Structurally unreachable today — push/pull_request events are
		// always repo-scoped (webhook.ts sets `repo` for both) — kept as a
		// defensive guard rather than a non-null assertion.
		return json({ handled: false, reason: `${event.type}: no repo in event` });
	}

	let context: ResolutionContext;
	try {
		context = resolutionContext(event);
	} catch (err) {
		// resolutionContext() only ever throws WebhookVerificationError —
		// the rethrow below is defensive, for a type it can't actually
		// produce today.
		/* istanbul ignore else -- see comment above */
		if (err instanceof WebhookVerificationError) {
			return json({ handled: false, reason: err.message });
		}
		/* istanbul ignore next -- see comment above */
		throw err;
	}

	const client = await createInstallationClient(
		{ appId: env.GITHUB_APP_ID, privateKey: env.GITHUB_APP_PRIVATE_KEY },
		event.installationId
	);

	// Commit-message linting (holocron#769/#771) is config-free by design
	// (D6, tech-sentinel-enforcement.spec.md) -- it never reads
	// holocron.config.ts, so it runs independent of validateConfig()'s
	// result below, and only for pull_request.* events (a push has no PR
	// commits to fetch; capability compliance still covers push separately).
	//
	// Soft-skip over hard-fail (CLAUDE.md's own standing convention for
	// orchestrator-shaped code): a failure here must never take down
	// capability compliance below it. Found the hard way -- the two
	// pipelines used to be independent request handlers in effect (nothing
	// upstream of capability compliance could fail), but sharing one
	// handle() call means an uncaught throw here reaches the SAME top-level
	// catch that used to only ever catch capability-compliance's own
	// failures, silently killing a check that had nothing to do with the
	// one that actually broke.
	let commitStandardsCheckRun;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const lintResult = await lintCommits({ client, repo, pullNumber: context.pullNumber });
			commitStandardsCheckRun = await postCommitStandardsCheck({
				client,
				repo,
				headSha: context.headSha,
				result: lintResult,
				runId,
			});
			// Matches SENTINEL_COMMIT_STANDARDS_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{ repo, valid: lintResult.valid, violationCount: lintResult.violations.length },
				SENTINEL_COMMIT_STANDARDS_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintCommits: failed, continuing without it");
		}
	}

	// Same PR-only scoping and soft-skip reasoning as commit standards above.
	// Runs alongside the existing probot/dcoapp installation, not instead of
	// it yet (same "prove it out before replacing" posture Bucket 2 dispatch
	// already established) -- see lint-dco.ts's own module docstring for why
	// this exists at all.
	let dcoCheckRun;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const lintResult = await lintDco({ client, repo, pullNumber: context.pullNumber });
			dcoCheckRun = await postDcoCheck({
				client,
				repo,
				headSha: context.headSha,
				result: lintResult,
				runId,
				headRef: context.headRef,
			});
			// Matches SENTINEL_DCO_LOG_MSG exactly -- the check's own details_url
			// is a query filtered to find this precise line.
			logger.info(
				{ repo, valid: lintResult.valid, violationCount: lintResult.violations.length },
				SENTINEL_DCO_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintDco: failed, continuing without it");
		}
	}

	// Same PR-only scoping and soft-skip reasoning as commit standards above
	// -- a push has no PR changed-files list to fetch, and a failure here
	// must never take capability compliance down with it.
	let inclusiveLanguageCheckRun;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const lintResult = await lintInclusiveLanguage({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
			});
			inclusiveLanguageCheckRun = await postInclusiveLanguageCheck({
				client,
				repo,
				headSha: context.headSha,
				result: lintResult,
				runId,
			});
			// Matches SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG exactly -- the check's
			// own details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: lintResult.valid,
					fileCount: lintResult.fileCount,
					messageCount: lintResult.messages.length,
				},
				SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintInclusiveLanguage: failed, continuing without it");
		}
	}

	// Same PR-only scoping and soft-skip reasoning as commit standards/
	// inclusive language above. `formattingLintResult` is hoisted (not
	// declared inside the try) so the auto-fix-commit gate further down
	// (holocron#820, after config validation) can read it without re-running
	// lintFormatting a second time.
	let formattingCheckRun;
	let formattingLintResult: LintFormattingResult | undefined;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const lintResult = await lintFormatting({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
			});
			formattingLintResult = lintResult;
			formattingCheckRun = await postFormattingCheck({
				client,
				repo,
				headSha: context.headSha,
				result: lintResult,
				runId,
			});
			// Matches SENTINEL_FORMATTING_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: lintResult.valid,
					fileCount: lintResult.fileCount,
					messageCount: lintResult.messages.length,
				},
				SENTINEL_FORMATTING_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintFormatting: failed, continuing without it");
		}
	}

	// Same PR-only scoping and soft-skip reasoning as commit standards/
	// inclusive language/formatting above. `editorConfigLintResult` is
	// hoisted (not declared inside the try) so the auto-fix-commit gate
	// further down can read it without re-running lintEditorConfig a
	// second time -- same reasoning as formattingLintResult above.
	let editorConfigCheckRun;
	let editorConfigLintResult: LintEditorConfigResult | undefined;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const lintResult = await lintEditorConfig({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
			});
			editorConfigLintResult = lintResult;
			editorConfigCheckRun = await postEditorConfigCheck({
				client,
				repo,
				headSha: context.headSha,
				result: lintResult,
				runId,
			});
			// Matches SENTINEL_EDITORCONFIG_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: lintResult.valid,
					fileCount: lintResult.fileCount,
					messageCount: lintResult.messages.length,
				},
				SENTINEL_EDITORCONFIG_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintEditorConfig: failed, continuing without it");
		}
	}

	// Same PR-only scoping and soft-skip reasoning as every Bucket 1 check
	// above -- the fourth (holocron#769/#821). `markdownLintResult` is
	// hoisted (not declared inside the try) so the auto-fix-commit gate
	// further down can read it without re-running lintMarkdown a second
	// time -- same reasoning as formattingLintResult/editorConfigLintResult
	// above.
	let markdownLintCheckRun;
	let markdownLintResult: LintMarkdownResult | undefined;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const lintResult = await lintMarkdown({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
			});
			markdownLintResult = lintResult;
			markdownLintCheckRun = await postMarkdownLintCheck({
				client,
				repo,
				pullNumber: context.pullNumber,
				headSha: context.headSha,
				result: lintResult,
				runId,
			});
			// Matches SENTINEL_MARKDOWN_LINT_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: lintResult.valid,
					fileCount: lintResult.fileCount,
					messageCount: lintResult.messages.length,
				},
				SENTINEL_MARKDOWN_LINT_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintMarkdown: failed, continuing without it");
		}
	}

	// PR Config Validation (holocron#827) -- advisory, never required,
	// deliberately separate from capability compliance below. Validates the
	// PR's OWN branch (ref-aware validateConfig(), holocron#820's follow-up)
	// so a PR proposing a new task/provider gets real feedback immediately,
	// rather than only after merge. `prConfigResult` is hoisted so the
	// auto-fix-commit gate further down reuses this same PR-branch read
	// instead of fetching it a second time.
	let prConfigValidationCheckRun;
	let prConfigResult: ValidateConfigResult | undefined;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const result = await validateConfig({ client, repo, ref: context.headSha });
			prConfigResult = result;
			prConfigValidationCheckRun = await postPrConfigValidationCheck({
				client,
				repo,
				headSha: context.headSha,
				result,
				runId,
			});
			// Matches SENTINEL_PR_CONFIG_VALIDATION_LOG_MSG exactly -- the
			// check's own details_url is a query filtered to find this
			// precise line.
			logger.info({ repo, status: result.status }, SENTINEL_PR_CONFIG_VALIDATION_LOG_MSG);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "validateConfig (PR ref): failed, continuing without it");
		}
	}

	const configResult = await validateConfig({ client, repo });
	if (configResult.status !== "valid") {
		logger.warn({ repo, result: configResult }, "validateConfig: not valid");
		return json({
			handled: true,
			type: event.type,
			config: configResult.status,
			commitStandardsCheckRun,
			dcoCheckRun,
			inclusiveLanguageCheckRun,
			formattingCheckRun,
			editorConfigCheckRun,
			markdownLintCheckRun,
			prConfigValidationCheckRun,
		});
	}

	const { properties } = await syncPropertiesFromConfig({
		client,
		repo,
		defaultBranch: context.defaultBranch,
		// TasksConfig has no index signature; syncPropertiesFromConfig reads
		// repo/providers loosely by design (see its own module docstring) —
		// same cast validate-config.ts's own tests already exercise.
		config: configResult.config as unknown as Record<string, unknown>,
	});
	const capabilities = properties["holocron_capabilities"];
	const checkRun = await postCheckRun({
		client,
		repo,
		headSha: context.headSha,
		capabilities: Array.isArray(capabilities) ? capabilities : [],
		runId,
	});
	// Matches SENTINEL_CAPABILITY_COMPLIANCE_LOG_MSG exactly -- the check's own
	// details_url is a query filtered to find this precise line.
	logger.info({ repo, conclusion: checkRun.conclusion }, SENTINEL_CAPABILITY_COMPLIANCE_LOG_MSG);

	// Bucket 2 dispatch prototype (holocron#769/#794, tech-sentinel-ci-runner.spec.md):
	// fires only for a repo that actually declares the one dispatchable task
	// this phase covers -- every other repo untouched. Runs alongside the
	// existing GitHub Actions thin-caller for the same task, not instead of
	// it, until this mechanism is trusted enough to replace it.
	// Soft-skip over hard-fail, same reasoning as commit standards above: a
	// dispatch failure must never take capability compliance down with it.
	let dispatchedCheckRun;
	const normalizedTasks = (configResult.config.tasks ?? []).map(normalizeTaskEntry);
	const taskNames = normalizedTasks.map((t) => t.name);
	if (taskNames.includes(SENTINEL_DISPATCHABLE_TASK)) {
		try {
			dispatchedCheckRun = await dispatchCheck({
				client,
				repo,
				headSha: context.headSha,
				ref: context.headSha,
				task: SENTINEL_DISPATCHABLE_TASK,
				checkName: SENTINEL_DISPATCHED_CHECK_NAME,
			});
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "dispatchCheck: failed, continuing without it");
		}
	}

	// Fifth Bucket 1 static-analysis check (holocron#769/#849) -- unlike its
	// four siblings above, NOT config-free: skipped entirely when this repo's
	// own `runtime_environment` property is explicitly "none" (a docs-only
	// repo has no JS/TS to lint at all). `properties` was already resolved
	// for capability compliance above -- reusing it here costs nothing extra.
	// Same PR-only scoping and soft-skip reasoning as every Bucket 1 check
	// above.
	let staticAnalysisCheckRun;
	if (
		event.type !== "push.default-branch" &&
		context.pullNumber !== undefined &&
		properties["runtime_environment"] !== "none"
	) {
		try {
			// TasksConfig has no `eslint` field (astromech's own concern is just
			// the task manifest) -- same loose-read-by-design cast
			// syncPropertiesFromConfig's own call above already uses for
			// repo/providers.
			const rawConfig = configResult.config as unknown as { eslint?: { browserPackages?: unknown } };
			const browserPackages = Array.isArray(rawConfig.eslint?.browserPackages)
				? rawConfig.eslint.browserPackages.filter((p): p is string => typeof p === "string")
				: undefined;
			const lintResult = await lintStaticAnalysis({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
				browserPackages,
			});
			staticAnalysisCheckRun = await postStaticAnalysisCheck({
				client,
				repo,
				pullNumber: context.pullNumber,
				headSha: context.headSha,
				result: lintResult,
				runId,
			});
			// Matches SENTINEL_STATIC_ANALYSIS_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: lintResult.valid,
					fileCount: lintResult.fileCount,
					messageCount: lintResult.messages.length,
				},
				SENTINEL_STATIC_ANALYSIS_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintStaticAnalysis: failed, continuing without it");
		}
	}

	// The actionlint half of sourceQuality.staticAnalysis (holocron#904) --
	// config-free, unlike eslint above: workflow files exist regardless of
	// `runtime_environment`. Same PR-only scoping and soft-skip reasoning as
	// every Bucket 1 check above.
	let actionlintCheckRun;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined) {
		try {
			const lintResult = await lintActionlint({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
			});
			actionlintCheckRun = await postActionlintCheck({
				client,
				repo,
				pullNumber: context.pullNumber,
				headSha: context.headSha,
				result: lintResult,
				runId,
			});
			// Matches SENTINEL_ACTIONLINT_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: lintResult.valid,
					fileCount: lintResult.fileCount,
					messageCount: lintResult.messages.length,
				},
				SENTINEL_ACTIONLINT_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintActionlint: failed, continuing without it");
		}
	}

	// Repo validation (holocron#913, #925): Sentinel's ports of the three
	// platform.repoValidation CI jobs, kept as separate checks -- ADRs and
	// specs and registry consistency can fail, docs presence is advisory
	// only. Unlike the config-free Bucket 1 checks above, all three only run for a repo whose
	// valid config declares that task (the same gate the Bucket 2 dispatch
	// uses): a repo that doesn't keep ADRs, specs or a packages/ monorepo has
	// nothing for them to check. Same PR-only scoping and soft-skip reasoning
	// as every Bucket 1 check above, each in its own try.
	let adrsCheckRun;
	let docsPresenceCheckRun;
	let registryCheckRun;
	if (
		event.type !== "push.default-branch" &&
		context.pullNumber !== undefined &&
		taskNames.includes(SENTINEL_REPO_VALIDATION_TASK)
	) {
		try {
			const result = await validateAdrs({ client, repo, pullNumber: context.pullNumber, ref: context.headSha });
			adrsCheckRun = await postAdrsCheck({
				client,
				repo,
				pullNumber: context.pullNumber,
				headSha: context.headSha,
				result,
				runId,
			});
			// Matches SENTINEL_ADRS_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{ repo, valid: result.valid, fileCount: result.fileCount, messageCount: result.messages.length },
				SENTINEL_ADRS_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "validateAdrs: failed, continuing without it");
		}

		try {
			const result = await validateDocsPresence({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
			});
			docsPresenceCheckRun = await postDocsPresenceCheck({
				client,
				repo,
				headSha: context.headSha,
				result,
				runId,
			});
			// Matches SENTINEL_DOCS_PRESENCE_LOG_MSG exactly -- the check's
			// own details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: result.valid,
					newPackages: result.newPackages.map((p) => p.name),
					hasDocsChange: result.hasDocsChange,
				},
				SENTINEL_DOCS_PRESENCE_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "validateDocsPresence: failed, continuing without it");
		}

		try {
			const result = await validateRegistry({
				client,
				repo,
				pullNumber: context.pullNumber,
				ref: context.headSha,
				loadRegistry: () => loadLatestRegistry(),
			});
			registryCheckRun = await postRegistryCheck({
				client,
				repo,
				pullNumber: context.pullNumber,
				headSha: context.headSha,
				result,
				runId,
			});
			// Matches SENTINEL_REGISTRY_LOG_MSG exactly -- the check's own
			// details_url is a query filtered to find this precise line.
			logger.info(
				{
					repo,
					valid: result.valid,
					checked: result.checked.map((p) => p.name),
					missing: result.missing.map((p) => p.name),
					registryVersion: result.registryVersion,
				},
				SENTINEL_REGISTRY_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "validateRegistry: failed, continuing without it");
		}
	}

	// Auto-fix-commit (holocron#820) -- default-on (holocron#864 follow-up),
	// opt-out either via the repo's merged `with: { autoFix: false }` on the
	// sourceQuality.formatting task, or via that same flag freshly added in
	// the PR's own branch (reusing PR Config Validation's own PR-branch read
	// above, holocron#827 -- no second fetch). The PR's own branch has the
	// final say when it declares an explicit value (letting a PR opt itself
	// in or out before that same config change merges to main); the merged
	// config's explicit value is the fallback; absent either, on by default,
	// since both fixes (prettier's and editorconfig's) are mechanical and
	// deterministic -- there's no human judgment call for a finding to
	// surface in the first place. The PR-branch read only ever feeds this
	// boolean decision, never anything persisted (see validate-config.ts's
	// own module docstring for the boundary that keeps this safe) -- unlike
	// every other check above, config-free by design, this is the one
	// exception, since writing to repo content is qualitatively different
	// from reading and reporting. One flag gates both actions below --
	// editorconfig is already bundled under this same task's `linterGroup`
	// (astromech's registry), so there's no separate knob to track.
	const formattingTask = normalizedTasks.find((t) => t.name === "sourceQuality.formatting");
	const mergedAutoFix = formattingTask?.with?.["autoFix"];
	let prAutoFix: unknown;
	if (prConfigResult?.status === "valid") {
		const prFormattingTask = (prConfigResult.config.tasks ?? [])
			.map(normalizeTaskEntry)
			.find((t) => t.name === "sourceQuality.formatting");
		prAutoFix = prFormattingTask?.with?.["autoFix"];
	}
	const autoFixOptedIn =
		typeof prAutoFix === "boolean" ? prAutoFix : typeof mergedAutoFix === "boolean" ? mergedAutoFix : true;

	// Formatting's own commit + explanatory PR comment. Only fires when: not
	// opted out, lintFormatting actually ran and found something to fix, and
	// this is a PR event with a real head branch to push to (a push to the
	// default branch has no PR branch to commit onto). Soft-skip over
	// hard-fail, same reasoning as every check above: a commit failure must
	// never take capability compliance down with it.
	let formattingFixResult;
	let autoFixCommentResult;
	if (autoFixOptedIn && formattingLintResult && !formattingLintResult.valid && context.headRef) {
		try {
			formattingFixResult = await commitFormattingFix({
				client,
				repo,
				headSha: context.headSha,
				headRef: context.headRef,
				result: formattingLintResult,
			});
			logger.info(
				{ repo, committed: formattingFixResult.committed, fileCount: formattingFixResult.fileCount },
				SENTINEL_FORMATTING_FIX_LOG_MSG
			);

			// PR comment (holocron#674/#834) -- explains what the commit
			// above just changed. Its own soft-skip, separate from the
			// commit's: a comment failure must never make an otherwise-
			// successful auto-fix commit look like it failed too.
			if (formattingFixResult.committed && context.pullNumber !== undefined) {
				try {
					autoFixCommentResult = await postAutoFixComment({
						client,
						repo,
						pullNumber: context.pullNumber,
						fixResult: formattingFixResult,
						lintResult: formattingLintResult,
					});
				} catch (err) {
					logger.error(
						{ repo, err: serializeError(err) },
						"postAutoFixComment: failed, continuing without it"
					);
				}
			}
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "commitFormattingFix: failed, continuing without it");
		}
	}

	// Editorconfig's own commit -- same gate, same reasoning, no explanatory
	// PR comment (unlike formatting): a failing check with its own
	// annotations already explains what's wrong, and a second comment on
	// top would be redundant noise for findings this narrow.
	let editorConfigFixResult;
	if (autoFixOptedIn && editorConfigLintResult && !editorConfigLintResult.valid && context.headRef) {
		try {
			editorConfigFixResult = await commitEditorConfigFix({
				client,
				repo,
				headSha: context.headSha,
				headRef: context.headRef,
				result: editorConfigLintResult,
			});
			logger.info(
				{ repo, committed: editorConfigFixResult.committed, fileCount: editorConfigFixResult.fileCount },
				SENTINEL_EDITORCONFIG_FIX_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "commitEditorConfigFix: failed, continuing without it");
		}
	}

	// Markdownlint's own commit -- same gate, same reasoning as editorconfig's.
	// No explanatory PR comment here either, same reasoning: the check's own
	// annotations (and, for error-severity findings, the PR review comment
	// postErrorReview() already posts) explain what's wrong without a second
	// comment on top. Gates on overall `valid`, not specifically on
	// error-severity, since auto-fix doesn't care about severity -- only
	// whether `applyFixes()` found anything deterministic to apply (some
	// rules, e.g. MD001 heading-increment, have no fixInfo at all regardless
	// of severity, and this org's own config disables most of the rules
	// that would otherwise overlap with what Prettier already fixes -- see
	// lint-markdown.ts's own module docstring).
	let markdownLintFixResult;
	if (autoFixOptedIn && markdownLintResult && !markdownLintResult.valid && context.headRef) {
		try {
			markdownLintFixResult = await commitMarkdownLintFix({
				client,
				repo,
				headSha: context.headSha,
				headRef: context.headRef,
				result: markdownLintResult,
			});
			logger.info(
				{ repo, committed: markdownLintFixResult.committed, fileCount: markdownLintFixResult.fileCount },
				SENTINEL_MARKDOWN_LINT_FIX_LOG_MSG
			);
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "commitMarkdownLintFix: failed, continuing without it");
		}
	}

	return json({
		handled: true,
		type: event.type,
		checkRun,
		commitStandardsCheckRun,
		dcoCheckRun,
		inclusiveLanguageCheckRun,
		formattingCheckRun,
		editorConfigCheckRun,
		markdownLintCheckRun,
		prConfigValidationCheckRun,
		formattingFixResult,
		autoFixCommentResult,
		editorConfigFixResult,
		markdownLintFixResult,
		dispatchedCheckRun,
		staticAnalysisCheckRun,
		actionlintCheckRun,
		adrsCheckRun,
		docsPresenceCheckRun,
		registryCheckRun,
	});
}
