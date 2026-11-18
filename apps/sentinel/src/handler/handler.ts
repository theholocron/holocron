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
 *   `docs/wiki/specifications/tech-sentinel-enforcement.spec.md`) — runs independent of
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
 * - **Repo validation** (`validateAdrs → postAdrsCheck`,
 *   `validateDocsPresence → postDocsPresenceCheck`, holocron#913):
 *   `pull_request.*` only, and only for a repo whose valid config declares
 *   `platform.repoValidation` -- Sentinel's ports of that task's CI
 *   jobs, kept as separate checks. ADR/spec frontmatter errors
 *   fail and post a PR review (same
 *   `postErrorReview()` split as eslint/actionlint); docs presence is
 *   advisory only (`neutral` at worst), and runs the same shared rules as
 *   `holocron probe docs presence` (`@theholocron/astromech/repo-validation`,
 *   holocron#929): new public packages and the `feat` rule with its
 *   `[skip docs] <reason>` marker. Editing a PR's title or description
 *   (`pull_request.edited`) re-runs that one check and nothing else.
 * - **PR Config Validation** (`validateConfig` against the PR's own head
 *   ref, holocron#827): posted as `validate:config / Run Holocron
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
 *   bundled under the same `format` task (astromech's registry
 *   `linterGroup`: prettier, editorconfig, markdownlint) — there's
 *   no separate `autoFix` flag to track per sub-check. Default-on
 *   (holocron#864 follow-up: every fix is mechanical and deterministic,
 *   so there's no human judgment call for a finding to surface in the
 *   first place); opt out via `{ name: "format", with: { autoFix: false } }`
 *   in `holocron.config.ts`'s `tasks` array (the deprecated alias
 *   `sourceQuality.formatting` still works; `readAutoFix` resolves both
 *   through astromech's `resolveTaskName`, the flat id winning when both
 *   are present). Reuses PR
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
 * - **#prs feed** (`runPrFeed`, holocron#1833, spec `tech-sentinel-pr-feed`): one forum
 *   post per pull request, kept in step with GitHub. Runs for every `pull_request.*`
 *   event, and alone (none of the checks above) for `pull_request.feed` (reopened,
 *   closed, ready_for_review, converted_to_draft, review_requested,
 *   review_request_removed, labeled, an edit of neither title nor description),
 *   `pull_request_review` and `check_run.completed` (only `ci / Required checks`
 *   reaches here). For opened/synchronize/edited it runs before the checks and
 *   independent of them. Off, with a quiet `skipped`, unless the role-sync settings
 *   `SENTINEL_ROLE_SYNC_REPO` and `HOLOCRON_DISCORD_BOT_TOKEN` are set and that repo's
 *   layout has a forum with `feeds.prs` (no new secret). A feed error answers 500 with
 *   the reason (merged into the checks' own response, which is otherwise unchanged)
 *   and logs an error line, so GitHub offers a redelivery, which is safe.
 *
 * Deliberately platform-agnostic: a plain `(Request, Env) => Response`
 * function, no framework, no deploy-target-specific wrapper. A thin
 * per-platform adapter — wiring this to the deploy target's actual
 * entry-point convention and reading its real secrets into `Env` — is
 * the still-open "Sentinel's own holocron.config.ts" PR-stack item.
 *
 * `Env` fields this handler expects, wired via `holocron sync secrets`
 * (holocron#781) from the 1Password Environment `Sentinel`: `SENTINEL_GITHUB_APP_ID`,
 * `SENTINEL_GITHUB_APP_PRIVATE_KEY` (or the older `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`),
 * `SENTINEL_WEBHOOK_SECRET`. The module-level
 * logger below reads two more, and the error reporter `SENTINEL_SENTRY_DSN` (holocron#1045), via
 * `@theholocron/env-utils/lookup` (see its own
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
import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { createInstallationClient, type GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";
import { createLogger } from "@theholocron/observability/logger";

import {
	type AutoFixKind,
	commitEditorConfigFix,
	commitFormattingFix,
	commitMarkdownLintFix,
	findAutoFixLoop,
	lintCommits,
	lintDco,
	lintEditorConfig,
	type LintEditorConfigResult,
	lintFormatting,
	type LintFormattingResult,
	lintInclusiveLanguage,
	lintMarkdown,
	type LintMarkdownResult,
	postAdrsCheck,
	postAutoFixComment,
	postAutoFixLoopComment,
	postCheckRun,
	postCommitStandardsCheck,
	postDcoCheck,
	postDocsPresenceCheck,
	postEditorConfigCheck,
	postFormattingCheck,
	postInclusiveLanguageCheck,
	postMarkdownLintCheck,
	postPrConfigValidationCheck,
	type PrFeedTrigger,
	runBoardStatus,
	type RunBoardStatusResult,
	runPrFeed,
	type RunPrFeedResult,
	runRoleSync,
	syncPropertiesFromConfig,
	toBoardStatusTrigger,
	toPrFeedTrigger,
	validateAdrs,
	validateDocsPresence,
} from "../actions/index.js";
import {
	createErrorReporter,
	declaresRepoValidation,
	githubAppCredentials,
	parseWebhookEvent,
	readAutoFix,
	resolveAxiomConfig,
	resolveErrorSink,
	SENTINEL_ADRS_LOG_MSG,
	SENTINEL_BOARD_STATUS_LOG_MSG,
	SENTINEL_CAPABILITY_COMPLIANCE_LOG_MSG,
	SENTINEL_COMMIT_STANDARDS_LOG_MSG,
	SENTINEL_DCO_LOG_MSG,
	SENTINEL_DOCS_PRESENCE_LOG_MSG,
	SENTINEL_EDITORCONFIG_FIX_LOG_MSG,
	SENTINEL_EDITORCONFIG_LOG_MSG,
	SENTINEL_FORMATTING_FIX_LOG_MSG,
	SENTINEL_FORMATTING_LOG_MSG,
	SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG,
	SENTINEL_MARKDOWN_LINT_FIX_LOG_MSG,
	SENTINEL_MARKDOWN_LINT_LOG_MSG,
	SENTINEL_PR_CONFIG_VALIDATION_LOG_MSG,
	SENTINEL_PR_FEED_LOG_MSG,
	SENTINEL_ROLE_SYNC_LOG_MSG,
	type SentinelEvent,
	validateConfig,
	type ValidateConfigResult,
	WebhookVerificationError,
} from "../utils/index.js";
import type { Env, ResolutionContext } from "./handler.type.js";

// Axiom transport config comes from the environment (utils/axiom-config.ts);
// absent → no transport, not a throw. `runId` is threaded into every check
// run's own output.text so a viewer can find the exact invocation's structured
// log line in Axiom without leaving GitHub.
const env = createEnvLookup();
const { logger, runId } = createLogger(resolveAxiomConfig(env));
// Error tracking (holocron#1045): `SENTINEL_SENTRY_DSN` unset means a no-op sink. Made on the first error and flushed
// (so closed) at the end of each delivery, see `createErrorReporter()`.
const errors = createErrorReporter(() => resolveErrorSink(env));

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
		pull_request?: {
			number?: number;
			title?: string;
			body?: string | null;
			head?: { sha?: string; ref?: string };
		};
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
		prTitle: raw.pull_request?.title,
		prBody: raw.pull_request?.body ?? undefined,
	};
}

/**
 * Runs the docs-presence check for a pull request and posts its check run (holocron#913, #929). Soft-skip like every
 * check in `handle()`: a failure is logged and the caller carries on without a check run. Shared by the full
 * pipeline and by the `pull_request.edited` path, which re-runs only this check.
 */
async function runDocsPresence(
	client: GitHubClient,
	repo: string,
	pullNumber: number,
	context: ResolutionContext
): Promise<Awaited<ReturnType<typeof postDocsPresenceCheck>> | undefined> {
	try {
		const result = await validateDocsPresence({
			client,
			repo,
			pullNumber,
			ref: context.headSha,
			prTitle: context.prTitle ?? "",
			prBody: context.prBody ?? "",
		});
		const checkRun = await postDocsPresenceCheck({ client, repo, headSha: context.headSha, result, runId });
		// Matches SENTINEL_DOCS_PRESENCE_LOG_MSG exactly -- the check's
		// own details_url is a query filtered to find this precise line.
		logger.info(
			{
				repo,
				valid: result.valid,
				newPackages: result.newPackages.map((p) => p.name),
				hasDocsChange: result.hasDocsChange,
				isFeat: result.isFeat,
				featWarnings: result.featWarnings.map((w) => w.dir),
			},
			SENTINEL_DOCS_PRESENCE_LOG_MSG
		);
		return checkRun;
	} catch (err) {
		logger.error({ repo, err: serializeError(err) }, "validateDocsPresence: failed, continuing without it");
		errors.capture(err);
		return undefined;
	}
}

/** Handles one inbound webhook request. Platform adapters call this directly — no `{ fetch }` wrapper required. */
export async function handleWebhookRequest(request: Request, env: Env): Promise<Response> {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405 });
	}

	errors.begin();
	try {
		return await handle(request, env);
	} catch (err) {
		// The read-only-filesystem ENOENT crash (validateConfig writing outside
		// os.tmpdir()) previously reached here with nothing observable at all --
		// a bare 500, no log line, no stack trace anywhere. Log first, then
		// still respond 500 (this is a genuine unhandled failure, not a
		// recognized "config didn't validate" case above).
		logger.error({ err: serializeError(err) }, "handleWebhookRequest: unhandled error");
		errors.capture(err);
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
		// Same reason for the error sink: Sentry queues an event and sends it later. The two flushes run side by side,
		// so an Axiom flush that stalls cannot keep a Sentry event from going out (Sentry's own close is time-boxed),
		// and `errors.flush()` never rejects.
		await Promise.all([
			(async () => {
				try {
					await logger.flush();
				} catch (err) {
					console.error("handleWebhookRequest: logger.flush() failed", err);
				}
			})(),
			errors.flush(),
		]);
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
		// GitHub's `ping` (sent when a webhook is made, and by "Redeliver") only proves the signature and the URL;
		// answering it as handled tells the sender the delivery worked.
		if (result.githubEvent === "ping") {
			return json({ handled: true, type: "ping" });
		}
		return json({ handled: false, reason: result.reason });
	}

	const { event } = result;
	if (event.type === "installation.created" || event.type === "installation.deleted") {
		return json({ handled: true, type: event.type });
	}

	// Role sync (holocron#1595): a team or org membership change keeps the server roles equal to their GitHub
	// teams. Org-level, so it has no repo and none of the checks below apply. A deployment that has not set
	// it up (see RoleSyncEnv) answers `skipped`; a sync that runs and fails answers 500, so the delivery shows
	// as failed in the App's "Recent deliveries" and can be redelivered (the sync is idempotent).
	if (event.type === "team.membership" || event.type === "organization.member-removed") {
		const roleClient = await createInstallationClient(githubAppCredentials(env), event.installationId);
		const sync = await runRoleSync({ client: roleClient, env, org: event.org!, team: event.team });
		const failed = sync.status === "fail" || sync.status === "partial";
		if (failed) logger.error({ org: event.org, team: event.team, sync }, SENTINEL_ROLE_SYNC_LOG_MSG);
		else logger.info({ org: event.org, team: event.team, sync }, SENTINEL_ROLE_SYNC_LOG_MSG);
		return json({ handled: true, type: event.type, sync }, failed ? 500 : 200);
	}

	const repo = event.repo;
	if (!repo) {
		// Structurally unreachable today — push/pull_request events are
		// always repo-scoped (webhook.ts sets `repo` for both) — kept as a
		// defensive guard rather than a non-null assertion.
		return json({ handled: false, reason: `${event.type}: no repo in event` });
	}

	// The #prs feed (holocron#1833). A review, a completed `ci / Required checks` and the pull_request actions only the
	// feed reads run none of the checks below. opened/synchronize/edited run the feed first and the checks after, each
	// independent of the other: the feed never throws (a failure is a result), and a check that throws still reaches the
	// catch in handleWebhookRequest with the feed already done.
	const trigger = toPrFeedTrigger(event);
	if (trigger) {
		const prFeed = await runFeed(event, repo, trigger, env);
		// The board follows the pull request (part 5 of #2388): independent of the feed and of the checks, and never the
		// reason for an error status, because the hourly `reconcile-projects` run repairs a miss.
		const boardStatus = await runBoard(event, repo, env);
		if (FEED_ONLY_EVENTS.has(event.type)) {
			return json({ handled: true, type: event.type, prFeed, boardStatus }, prFeed.status === "fail" ? 500 : 200);
		}
		return withPrFeed(await handleChecks(event, repo, env), prFeed, boardStatus);
	}
	return handleChecks(event, repo, env);
}

/** Events only the feed reads: no check of the pipeline below runs for them. */
const FEED_ONLY_EVENTS: ReadonlySet<SentinelEvent["type"]> = new Set([
	"pull_request.feed",
	"pull_request_review",
	"check_run.completed",
]);

/**
 * Runs the feed for a delivery and logs its result (an error line for a failure, like role sync). Never throws: it
 * must not change what the other actions do, so even a failure to get an installation token is a `fail` result.
 */
async function runFeed(event: SentinelEvent, repo: string, trigger: PrFeedTrigger, env: Env): Promise<RunPrFeedResult> {
	let prFeed: RunPrFeedResult;
	let thrown: unknown;
	try {
		const client = await createInstallationClient(githubAppCredentials(env), event.installationId);
		prFeed = await runPrFeed({ client, env, repo, trigger });
	} catch (err) {
		thrown = err;
		prFeed = { status: "fail", reason: err instanceof Error ? err.message : String(err) };
	}
	// A feed that fails is usually a returned `fail` result, not a throw, so both reach the error tracker.
	if (prFeed.status === "fail") errors.capture(thrown ?? new Error(`pr feed failed: ${prFeed.reason}`));
	if (prFeed.status === "fail") logger.error({ repo, type: event.type, prFeed }, SENTINEL_PR_FEED_LOG_MSG);
	else logger.info({ repo, type: event.type, prFeed }, SENTINEL_PR_FEED_LOG_MSG);
	return prFeed;
}

/**
 * Runs the board-status handler for a delivery the rules read and logs its result; `undefined` for any other event.
 * Never throws: a failure to get an installation token is a `fail` result, and an item that could not be moved is
 * logged as a warning. No result changes the response status.
 */
async function runBoard(event: SentinelEvent, repo: string, env: Env): Promise<RunBoardStatusResult | undefined> {
	const trigger = toBoardStatusTrigger(event);
	if (!trigger) return undefined;
	let boardStatus: RunBoardStatusResult;
	let thrown: unknown;
	try {
		const client = await createInstallationClient(githubAppCredentials(env), event.installationId);
		boardStatus = await runBoardStatus({ client, env, repo, trigger });
	} catch (err) {
		thrown = err;
		boardStatus = { status: "fail", reason: err instanceof Error ? err.message : String(err) };
	}
	if (boardStatus.status === "fail") {
		errors.capture(thrown ?? new Error(`board status failed: ${boardStatus.reason}`));
		logger.error({ repo, type: event.type, boardStatus }, SENTINEL_BOARD_STATUS_LOG_MSG);
	} else if (boardStatus.status === "ok" && boardStatus.failed.length > 0) {
		logger.warn({ repo, type: event.type, boardStatus }, SENTINEL_BOARD_STATUS_LOG_MSG);
	} else {
		logger.info({ repo, type: event.type, boardStatus }, SENTINEL_BOARD_STATUS_LOG_MSG);
	}
	return boardStatus;
}

/** Adds the feed's result (and the board's) to a checks response, answering 500 when the feed failed so the delivery can be redelivered. */
async function withPrFeed(
	response: Response,
	prFeed: RunPrFeedResult,
	boardStatus?: RunBoardStatusResult
): Promise<Response> {
	const body = (await response.json()) as Record<string, unknown>;
	return json({ ...body, prFeed, boardStatus }, prFeed.status === "fail" ? 500 : response.status);
}

/** The check pipelines for a `push.default-branch` or `pull_request.*` event (everything below). */
async function handleChecks(event: SentinelEvent, repo: string, env: Env): Promise<Response> {
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

	const client = await createInstallationClient(githubAppCredentials(env), event.installationId);

	// A PR title or description edit changes only what the docs-presence check
	// reads (a `feat` in the title, a `[skip docs]` marker in the description),
	// so it re-runs that one check and nothing else -- no commit changed, and
	// the other checks (and the auto-fix commit) would only repeat themselves.
	if (event.type === "pull_request.edited") {
		const editedConfig = await validateConfig({ client, repo });
		const declared =
			editedConfig.status === "valid" &&
			declaresRepoValidation((editedConfig.config.tasks ?? []).map(normalizeTaskEntry).map((t) => t.name));
		const docsPresenceCheckRun =
			declared && context.pullNumber !== undefined
				? await runDocsPresence(client, repo, context.pullNumber, context)
				: undefined;
		return json({ handled: true, type: event.type, docsPresenceCheckRun });
	}

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
			errors.capture(err);
		}
	}

	// Same PR-only scoping and soft-skip reasoning as commit standards above.
	// The required DCO check (it replaced the probot/dcoapp installation, #1044)
	// -- see lint-dco.ts's own module docstring for why this exists at all.
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
			errors.capture(err);
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
			errors.capture(err);
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
			errors.capture(err);
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
			errors.capture(err);
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
			errors.capture(err);
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
			errors.capture(err);
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

	// Eslint, actionlint and the typecheck are not Sentinel's: the Actions `lint:code` and `typecheck` run them with the
	// repo's own config, and two checks of one task id from two apps would disagree (`process-sentinel-and-actions-roles`,
	// #2263).
	const normalizedTasks = (configResult.config.tasks ?? []).map(normalizeTaskEntry);
	const taskNames = normalizedTasks.map((t) => t.name);

	// Repo validation (holocron#913): Sentinel's ports of the
	// platform.repoValidation CI jobs, kept as separate checks -- ADRs and
	// specs can fail, docs presence is advisory
	// only. Unlike the config-free Bucket 1 checks above, both only run for a repo whose
	// valid config declares that task: a repo that doesn't keep ADRs, specs or a packages/ monorepo has
	// nothing for them to check. Same PR-only scoping and soft-skip reasoning
	// as every Bucket 1 check above, each in its own try.
	let adrsCheckRun;
	let docsPresenceCheckRun;
	if (event.type !== "push.default-branch" && context.pullNumber !== undefined && declaresRepoValidation(taskNames)) {
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
			errors.capture(err);
		}

		docsPresenceCheckRun = await runDocsPresence(client, repo, context.pullNumber, context);
	}

	// Auto-fix-commit (holocron#820) -- default-on (holocron#864 follow-up),
	// opt-out either via the repo's merged `with: { autoFix: false }` on the
	// `format` task (or its deprecated alias `sourceQuality.formatting`, see
	// readAutoFix), or via that same flag freshly added in
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
	const mergedAutoFix = readAutoFix(normalizedTasks);
	const prAutoFix =
		prConfigResult?.status === "valid"
			? readAutoFix((prConfigResult.config.tasks ?? []).map(normalizeTaskEntry))
			: undefined;
	const autoFixOptedIn = prAutoFix ?? mergedAutoFix ?? true;

	// Loop guard (holocron#1950). Two fixers can disagree about one line (markdownlint strips the spaces of an MDX
	// comment, prettier puts them back), and each commit triggers a delivery that finds the other's finding again:
	// 34 commits in 26 minutes on #1949. A fixer that already committed since the last commit of a person's is not
	// run again, and the pull request gets one comment saying so. A failed read of the commits blocks nothing.
	// A fixer is wanted only for the files where part of its fix is on a line the pull request added (holocron#1950):
	// the commit writes nothing else, so a finding on a line the pull request left alone starts no loop.
	const wantedFixes: { kind: AutoFixKind; files: string[] }[] = [];
	const inScope = (items: { file: string; scopedFix: string | null }[]) =>
		items.filter((i) => i.scopedFix !== null).map((i) => i.file);
	if (formattingLintResult && !formattingLintResult.valid) {
		wantedFixes.push({ kind: "formatting", files: inScope(formattingLintResult.messages) });
	}
	if (editorConfigLintResult && !editorConfigLintResult.valid) {
		wantedFixes.push({ kind: "editorconfig", files: inScope(editorConfigLintResult.fixes) });
	}
	if (markdownLintResult && !markdownLintResult.valid) {
		wantedFixes.push({ kind: "markdown-lint", files: inScope(markdownLintResult.fixes) });
	}
	let blockedFixes: AutoFixKind[] = [];
	if (
		autoFixOptedIn &&
		context.headRef &&
		context.pullNumber !== undefined &&
		wantedFixes.some((w) => w.files.length > 0)
	) {
		try {
			blockedFixes = (await findAutoFixLoop({ client, repo, pullNumber: context.pullNumber })).blocked;
			const stopped = wantedFixes.filter((w) => w.files.length > 0 && blockedFixes.includes(w.kind));
			if (stopped.length > 0) {
				logger.warn({ repo, kinds: stopped.map((s) => s.kind) }, "autoFixLoop: stopped a repeated auto-fix");
				await postAutoFixLoopComment({
					client,
					repo,
					pullNumber: context.pullNumber,
					kinds: stopped.map((s) => s.kind),
					files: [...new Set(stopped.flatMap((s) => s.files))],
				});
			}
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "autoFixLoop: failed, continuing without it");
			errors.capture(err);
		}
	}

	// Formatting's own commit + explanatory PR comment. Only fires when: not
	// opted out, lintFormatting actually ran and found something to fix, and
	// this is a PR event with a real head branch to push to (a push to the
	// default branch has no PR branch to commit onto). Soft-skip over
	// hard-fail, same reasoning as every check above: a commit failure must
	// never take capability compliance down with it.
	let formattingFixResult;
	let autoFixCommentResult;
	if (
		autoFixOptedIn &&
		formattingLintResult &&
		!formattingLintResult.valid &&
		context.headRef &&
		!blockedFixes.includes("formatting")
	) {
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
					errors.capture(err);
				}
			}
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "commitFormattingFix: failed, continuing without it");
			errors.capture(err);
		}
	}

	// Editorconfig's own commit -- same gate, same reasoning, no explanatory
	// PR comment (unlike formatting): a failing check with its own
	// annotations already explains what's wrong, and a second comment on
	// top would be redundant noise for findings this narrow.
	let editorConfigFixResult;
	if (
		autoFixOptedIn &&
		editorConfigLintResult &&
		!editorConfigLintResult.valid &&
		context.headRef &&
		!blockedFixes.includes("editorconfig")
	) {
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
			errors.capture(err);
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
	if (
		autoFixOptedIn &&
		markdownLintResult &&
		!markdownLintResult.valid &&
		context.headRef &&
		!blockedFixes.includes("markdown-lint")
	) {
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
			errors.capture(err);
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
		adrsCheckRun,
		docsPresenceCheckRun,
	});
}
