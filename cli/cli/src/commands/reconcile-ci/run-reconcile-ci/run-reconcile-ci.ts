/**
 * `holocron reconcile ci [pull-request]` — make the `ci / Required checks` check say what the state calls for.
 *
 * It is the manual tool and the scheduled sweep of spec `process-sentinel-posts-ci` (SPEC-0099): for each open pull
 * request (or the one named) it reads the check runs and commit statuses of the head commit through the `source`
 * provider and calls astromech's `postAggregate()`, the one function Sentinel's webhook handler uses too. A pull request
 * whose check already says the verdict is left alone, so a healthy run writes nothing; one with no check, or one that
 * disagrees, is posted. A pull request that was missing or wrong and had waited longer than `--max-age` is a failing
 * row, because that is what a missed delivery looks like; one younger than that is still in flight and only reported.
 *
 * It posts the real `ci / Required checks` only where the checkout's `ci.aggregate` is `sentinel`: while it is
 * `actions` the Actions job is the poster and a second writer would be a second poster, so the command does nothing
 * unless `--shadow` asks it to repair Sentinel's shadow check. A run on a commit where another app (the Actions
 * job) already posts the check leaves it alone.
 *
 * `expected` comes from the config of the checkout it runs in. The sweep runs from the default branch, which is the
 * base of the pull requests it repairs, so a pull request cannot shrink its own gate. `--dry-run` reads and prints what
 * it would do and posts nothing.
 */

import {
	AGGREGATE_CHECK_NAME,
	AGGREGATE_SHADOW_CHECK_NAME,
	aggregateChecks,
	aggregatePoster,
	postAggregate,
} from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";
import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { getLogger } from "../../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type PullRequest, type Source } from "../../../plugin/index.js";
import type { ReconcileCiReport, RunReconcileCiInput } from "./run-reconcile-ci.type.js";

const DEFAULT_MAX_AGE_MINUTES = 10;

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/** The `source` methods the sweep needs, all of them optional on the capability. */
function missingMethods(source: Source): string[] {
	const needs = ["listCheckRuns", "listCommitStatuses", "createCheckRun", "updateCheckRun"] as const;
	return needs.filter((name) => typeof source[name] !== "function");
}

/** Runs `holocron reconcile ci`; see the file's comment. */
export async function runReconcileCi(input: RunReconcileCiInput): Promise<ReconcileCiReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const now = input.now ?? Date.now;
	const dryRun = Boolean(input.context.dryRun);
	const rows: CheckRow[] = [];
	const finish = (): ReconcileCiReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		const status = summary.fail > 0 ? "fail" : "ok";
		logger.info({ ...summary, status }, "reconcile ci");
		return { status, rows };
	};
	const fail = (id: string, detail: string): ReconcileCiReport => {
		rows.push(row(id, "fail", detail));
		return finish();
	};
	print(style.header(`Holocron reconcile ci${dryRun ? " (dry-run)" : ""}`));
	print("");

	if (input.maxAgeMinutes !== undefined && !(input.maxAgeMinutes > 0)) {
		return fail("max-age", "--max-age is a number of minutes above zero");
	}
	// A commit has one poster. While `ci.aggregate` is `actions` (the default) the Actions job posts the real check, and a
	// second writer under the same name would be a second poster, so only the shadow may be repaired.
	if (!input.shadow && aggregatePoster({ ci: input.loaded.resolved.ci }) === "actions") {
		rows.push(
			row(
				"ci.aggregate",
				"skip",
				`ci.aggregate is actions here, so the Actions job posts ${AGGREGATE_CHECK_NAME} and nothing is posted; --shadow repairs Sentinel's shadow check`
			)
		);
		return finish();
	}
	const providers = input.loaded.resolved.providers;
	if (!providers.source)
		return fail("source", "the config has no `source` provider to read and post the checks with");
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{
				...input.loaded.resolved,
				providers: {
					source: providers.source,
					...(providers.credentials ? { credentials: providers.credentials } : {}),
				},
			},
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "reconcile ci");
	if (!loader.has("source")) {
		const failure = loader.loadFailures().find((f) => f.key === "source");
		return fail(
			"source",
			`the \`source\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
		);
	}
	const source = loader.get("source");
	const lacking = missingMethods(source);
	if (lacking.length > 0) {
		return fail("source", `the \`${source.providerName}\` provider cannot ${lacking.join(", ")}`);
	}

	const config = input.loaded.resolved;
	const tasksConfig: TasksConfig = { tasks: config.tasks ?? [] };
	if (config.extraRequiredChecks) tasksConfig.extraRequiredChecks = config.extraRequiredChecks;
	const { expected, statuses } = aggregateChecks(tasksConfig);

	let pullRequests: PullRequest[];
	try {
		if (input.pullRequest !== undefined) {
			if (!source.getPullRequest)
				return fail("pull requests", `the \`${source.providerName}\` provider cannot read a pull request`);
			pullRequests = [await source.getPullRequest(input.pullRequest)];
		} else {
			if (!source.listPullRequests)
				return fail("pull requests", `the \`${source.providerName}\` provider cannot list pull requests`);
			pullRequests = await source.listPullRequests("open");
		}
	} catch (error) {
		return fail("pull requests", describeError(error));
	}
	if (pullRequests.length === 0) {
		rows.push(row("pull requests", "skip", "no open pull requests"));
		return finish();
	}

	const api = {
		listCheckRuns: (sha: string) => source.listCheckRuns!(sha),
		listCommitStatuses: (sha: string) => source.listCommitStatuses!(sha),
		createCheckRun: (sha: string, name: string, write: Parameters<NonNullable<Source["createCheckRun"]>>[2]) =>
			source.createCheckRun!(sha, name, write),
		updateCheckRun: (id: number, write: Parameters<NonNullable<Source["updateCheckRun"]>>[1]) =>
			source.updateCheckRun!(id, write),
	};
	const graceMs = (input.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES) * 60_000;
	for (const pr of pullRequests) {
		const id = `#${pr.number}`;
		if (pr.headSha === undefined) {
			rows.push(row(id, "skip", "the provider gave no head commit"));
			continue;
		}
		try {
			const out = await postAggregate({
				api,
				sha: pr.headSha,
				expected,
				statuses,
				now: now(),
				graceMs,
				dryRun,
				name: input.shadow ? AGGREGATE_SHADOW_CHECK_NAME : AGGREGATE_CHECK_NAME,
			});
			const verdict = out.result.conclusion;
			if (out.action === "foreign") {
				rows.push(
					row(id, "skip", "another app (the Actions job) already posts this check on the commit; left alone")
				);
			} else if (out.action === "unchanged") {
				rows.push(row(id, "ok", `up to date (${verdict})`));
			} else if (out.stale) {
				const what = dryRun ? "would repair" : "repaired";
				rows.push(
					row(id, "fail", `${what}: the check was missing or wrong (now ${verdict}); a delivery was missed`)
				);
			} else {
				const what = dryRun ? "would post" : "posted";
				rows.push(row(id, "ok", `${what} ${verdict} (still in flight)`));
			}
		} catch (error) {
			rows.push(row(id, "fail", describeError(error)));
		}
	}
	return finish();
}
