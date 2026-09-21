/**
 * The webhook receiver's core logic — wires `parseWebhookEvent →
 * validateConfig → syncPropertiesFromConfig → postCheckRun` into a
 * single Fetch-API request handler, all through an installation-scoped
 * `GitHubClient` (D10: the installation id always comes from the
 * webhook payload itself, never hardcoded, so one App registration
 * handles installations across any number of orgs/accounts unchanged).
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
 * acknowledged, not acted on — no per-installation action is defined
 * yet. `push.default-branch` and `pull_request.opened`/`synchronize`
 * both run the full resolution pipeline (same engine, D8 — the only
 * difference is which commit SHA the check run attaches to), but only
 * when `validateConfig()` reports `"valid"`: the spec's stated v1 scope
 * is "capability-compliance status", which presupposes a valid config
 * to check compliance *against* — a missing/broken config is
 * acknowledged without posting a check run, deferring richer "the
 * config itself is broken" reporting to a later iteration.
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

import { createInstallationClient } from "@theholocron/github-client";
import { createLogger } from "@theholocron/observability/logger";

import { postCheckRun } from "./actions/post-check-run.js";
import { syncPropertiesFromConfig } from "./actions/sync-properties.js";
import { validateConfig } from "./utils/validate-config.js";
import { parseWebhookEvent, type SentinelEvent, WebhookVerificationError } from "./utils/webhook.js";

// No Axiom config wired yet (the still-open "Secrets flow" PR-stack item) --
// createLogger() with no options is still a real, working Logger, just
// writing structured NDJSON to stdout instead of shipping to Axiom. That's
// enough to be visible in Vercel's own function logs, which is the whole
// point here: an uncaught exception previously meant *nothing* observable
// beyond a bare 500 (see below) -- found the hard way debugging the
// read-only-filesystem ENOENT crash with no log line to point at it.
const { logger } = createLogger();

export interface Env {
	GITHUB_APP_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	SENTINEL_WEBHOOK_SECRET: string;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The push/pull_request-specific fields the pipeline needs beyond what `SentinelEvent` already normalizes. */
interface ResolutionContext {
	defaultBranch: string;
	headSha: string;
}

/**
 * Reads `defaultBranch` and the commit SHA to check from `event.raw` —
 * `SentinelEvent`'s normalized shape doesn't carry either, since
 * `postCheckRun`/`syncPropertiesFromConfig` are the only consumers that
 * need them, and `webhook.ts`'s own job stops at "which event category,
 * which repo, which installation" (see its own module docstring).
 */
function resolutionContext(event: SentinelEvent): ResolutionContext {
	const raw = event.raw as {
		repository?: { default_branch?: string };
		after?: string;
		pull_request?: { head?: { sha?: string } };
	};
	const defaultBranch = raw.repository?.default_branch;
	const headSha = event.type === "push.default-branch" ? raw.after : raw.pull_request?.head?.sha;
	if (!defaultBranch || !headSha) {
		throw new WebhookVerificationError(
			`${event.type}: payload missing repository.default_branch or the commit SHA to check`
		);
	}
	return { defaultBranch, headSha };
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
		logger.error(
			{ err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err) },
			"handleWebhookRequest: unhandled error"
		);
		return json({ handled: false, reason: "internal error" }, 500);
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

	const configResult = await validateConfig({ client, repo });
	if (configResult.status !== "valid") {
		logger.warn({ repo, result: configResult }, "validateConfig: not valid");
		return json({ handled: true, type: event.type, config: configResult.status });
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
	});

	return json({ handled: true, type: event.type, checkRun });
}
