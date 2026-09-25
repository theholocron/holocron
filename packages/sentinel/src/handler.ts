/**
 * The webhook receiver's core logic — wires three independent check
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
 * - **Bucket 2 dispatch** (`dispatchCheck`, holocron#769/#794,
 *   `tech-sentinel-ci-runner.spec.md`): fires for both event types, same as
 *   capability compliance, but only when the repo's *valid* config declares
 *   `SENTINEL_DISPATCHABLE_TASK` — one hardcoded task for this prototype
 *   phase, not a general Bucket-2-task sweep. Runs *alongside* the existing
 *   GitHub Actions thin-caller for that same task, not instead of it, until
 *   this mechanism is trusted enough to replace it.
 *
 * Deliberately platform-agnostic: a plain `(Request, Env) => Response`
 * function, no framework, no deploy-target-specific wrapper. A thin
 * per-platform adapter — wiring this to the deploy target's actual
 * entry-point convention and reading its real secrets into `Env` — is
 * the still-open "Sentinel's own holocron.config.ts" PR-stack item.
 *
 * `Env` fields this handler expects (wired via `holocron secrets sync`
 * once the still-open "Secrets flow" PR-stack item lands):
 * `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `SENTINEL_WEBHOOK_SECRET`.
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
import { createInstallationClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";
import { createLogger } from "@theholocron/observability/logger";

import { postCheckRun } from "./actions/capability-compliance/post-check-run.js";
import { syncPropertiesFromConfig } from "./actions/capability-compliance/sync-properties.js";
import { lintCommits } from "./actions/commit-standards/lint-commits.js";
import { postCommitStandardsCheck } from "./actions/commit-standards/post-commit-standards-check.js";
import { dispatchCheck } from "./actions/dispatched-check/dispatch-check.js";
import { SENTINEL_DISPATCHABLE_TASK, SENTINEL_DISPATCHED_CHECK_NAME } from "./utils/constants.js";
import { validateConfig } from "./utils/validate-config.js";
import { parseWebhookEvent, type SentinelEvent, WebhookVerificationError } from "./utils/webhook.js";

// createLogger() with no options auto-detects AXIOM_TOKEN/AXIOM_DATASET
// from process.env (holocron#780) -- wired directly on the Vercel project
// rather than through holocron secrets sync, which needs its own vault
// config Sentinel doesn't have yet (holocron#781). `runId` is threaded
// into every check run's own output.text so a viewer can find the exact
// invocation's structured log line in Axiom without leaving GitHub.
const { logger, runId } = createLogger();

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
		pull_request?: { number?: number; head?: { sha?: string } };
	};
	const defaultBranch = raw.repository?.default_branch;
	const headSha = event.type === "push.default-branch" ? raw.after : raw.pull_request?.head?.sha;
	if (!defaultBranch || !headSha) {
		throw new WebhookVerificationError(
			`${event.type}: payload missing repository.default_branch or the commit SHA to check`
		);
	}
	return { defaultBranch, headSha, pullNumber: raw.pull_request?.number };
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
		} catch (err) {
			logger.error({ repo, err: serializeError(err) }, "lintCommits: failed, continuing without it");
		}
	}

	const configResult = await validateConfig({ client, repo });
	if (configResult.status !== "valid") {
		logger.warn({ repo, result: configResult }, "validateConfig: not valid");
		return json({ handled: true, type: event.type, config: configResult.status, commitStandardsCheckRun });
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

	// Bucket 2 dispatch prototype (holocron#769/#794, tech-sentinel-ci-runner.spec.md):
	// fires only for a repo that actually declares the one dispatchable task
	// this phase covers -- every other repo untouched. Runs alongside the
	// existing GitHub Actions thin-caller for the same task, not instead of
	// it, until this mechanism is trusted enough to replace it.
	// Soft-skip over hard-fail, same reasoning as commit standards above: a
	// dispatch failure must never take capability compliance down with it.
	let dispatchedCheckRun;
	const taskNames = (configResult.config.tasks ?? []).map(normalizeTaskEntry).map((t) => t.name);
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

	return json({ handled: true, type: event.type, checkRun, commitStandardsCheckRun, dispatchedCheckRun });
}
