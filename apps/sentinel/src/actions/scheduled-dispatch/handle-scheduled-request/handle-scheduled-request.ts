import { createEnvLookup } from "@theholocron/env-utils/lookup";
import { createInstallationClient, getRepoInstallation } from "@theholocron/github-client";
import { errorMessage } from "@theholocron/misc-utils";
import { createLogger } from "@theholocron/observability/logger";

import {
	createErrorReporter,
	githubAppCredentials,
	resolveAxiomConfig,
	resolveErrorSink,
} from "../../../utils/index.js";
import { isCronAuthorized } from "../is-cron-authorized/index.js";
import { runScheduledDispatch } from "../run-scheduled-dispatch/index.js";
import type { HandleScheduledOptions, ScheduledDispatchEnv } from "../scheduled-dispatch.type.js";

interface Observability {
	logger: ReturnType<typeof createLogger>["logger"];
	errors: ReturnType<typeof createErrorReporter>;
}

let observability: Observability | undefined;

/**
 * The logger and the error reporter, made on the first request and not at import: the webhook handler builds the one
 * logger a test of its own counts, and this module is imported with the rest of the actions.
 */
function observe(): Observability {
	if (!observability) {
		const processEnv = createEnvLookup();
		observability = {
			logger: createLogger(resolveAxiomConfig(processEnv)).logger,
			errors: createErrorReporter(() => resolveErrorSink(processEnv)),
		};
	}
	return observability;
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Flushes the logger and the error sink: Vercel can freeze the function right after the response. */
async function finish({ logger, errors }: Observability): Promise<void> {
	await Promise.all([
		(async () => {
			try {
				await logger.flush();
			} catch (err) {
				console.error("handleScheduledRequest: logger.flush() failed", err);
			}
		})(),
		errors.flush(),
	]);
}

/**
 * The function behind a Vercel cron entry (`/api/scheduled?task=<id>`, spec `tech-sentinel-scheduled-dispatch`, #2609):
 * checks the call carries `CRON_SECRET`, finds the App's installation on `SENTINEL_REPO` and asks GitHub to run
 * the task's workflow. It fails closed: no `CRON_SECRET` is `503`, a wrong or missing secret `401`, no repository set
 * `404`, an unknown task `404`, an App not installed there or a refused dispatch `502`; only a dispatch GitHub accepted is
 * `200`. Anything but `GET` is `405`. Never retried within the request: the next cron call is the retry.
 */
export async function handleScheduledRequest(
	request: Request,
	env: ScheduledDispatchEnv,
	options: HandleScheduledOptions = {}
): Promise<Response> {
	const seen = observe();
	seen.errors.begin();
	try {
		return await handle(request, env, options, seen);
	} catch (err) {
		seen.logger.error({ err: errorMessage(err) }, "handleScheduledRequest: unhandled error");
		seen.errors.capture(err);
		return json({ handled: false, reason: "internal error" }, 500);
	} finally {
		await finish(seen);
	}
}

async function handle(
	request: Request,
	env: ScheduledDispatchEnv,
	options: HandleScheduledOptions,
	{ logger, errors }: Observability
): Promise<Response> {
	if (request.method !== "GET") return json({ handled: false, reason: "use GET" }, 405);
	const lookup = createEnvLookup(env as Record<string, string | undefined>);
	const secret = lookup.get("CRON_SECRET");
	if (!secret) return json({ handled: false, reason: "CRON_SECRET is not set" }, 503);
	if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
		return json({ handled: false, reason: "unauthorized" }, 401);
	}
	const repo = lookup.get("SENTINEL_REPO");
	if (!repo) return json({ handled: false, reason: "SENTINEL_REPO is not set" }, 404);
	const task = new URL(request.url).searchParams.get("task");
	if (!task) return json({ handled: false, reason: "name a task with ?task=" }, 400);

	const creds = githubAppCredentials(env);
	const installationId = await (options.findInstallation ?? (async (r) => (await getRepoInstallation(creds, r))?.id))(
		repo
	);
	if (installationId === undefined) {
		logger.error({ task, repo }, "scheduledDispatch: the App is not installed on the repository");
		return json({ handled: false, task, reason: `the App is not installed on ${repo}` }, 502);
	}
	const client = await (options.makeClient ?? ((id) => createInstallationClient(creds, id)))(installationId);

	const result = await runScheduledDispatch({ client, repo, task });
	if (result.status === "unknown") return json({ handled: false, task, reason: result.reason }, 404);
	if (result.status === "fail") {
		logger.error({ task, repo, reason: result.reason }, "scheduledDispatch: GitHub refused the dispatch");
		errors.capture(new Error(`scheduledDispatch ${task}: ${result.reason}`));
		return json({ handled: false, task, reason: result.reason }, 502);
	}
	logger.info({ task, repo, workflow: result.workflow, ref: result.ref }, "scheduledDispatch: dispatched");
	return json({ handled: true, task, workflow: result.workflow, ref: result.ref }, 200);
}
