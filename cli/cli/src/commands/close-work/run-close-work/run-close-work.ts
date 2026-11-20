/**
 * `holocron close work <issue>` — the end of a piece of work (spec `tool-work-commands`, #2429, part 6).
 *
 * It never merges: the maintainer does. For work with an open pull request it reads the `ci / Required checks`
 * aggregate (with `--wait`, polling until it is green or red or `--timeout` passes), and only on green asks, marks the
 * pull request ready (the board then moves to In Review by itself), adds the area labels the changed folders earn
 * (through `update work`, add-only) and takes closed blockers off the issue. Not green stops there and names the failing
 * checks. Run again after the maintainer merged, it removes the worktree and the local branch and checks the remote
 * branch is gone (GitHub deletes it; this only looks). `--abandon` is the other ending: see `abandonWork()`.
 *
 * Each step is independent and probes first, and the aggregate is read every run, so "ready" is never assumed and a
 * second run does only what is left. It asks before it writes unless `--yes`; without a terminal that is a
 * `NonInteractiveError`, except on `--dry-run`, which runs every read, prints `would ...` and writes nothing, local git
 * included.
 */

import { confirm } from "@inquirer/prompts";
import { runGit } from "@theholocron/kyber/git";
import {
	type CheckRow,
	describeError,
	NonInteractiveError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { assertPluginsResolvable, PluginLoader, type PullRequest } from "../../../plugin/index.js";
import { runIssueUpdate } from "../../issue-update/run-issue-update/index.js";
import { findWorkPullRequests } from "../../update-work/find-work-pull-request/index.js";
import { runUpdateWork } from "../../update-work/run-update-work/index.js";
import { abandonWork } from "../abandon-work/index.js";
import { cleanUpWork } from "../clean-up-work/index.js";
import { findClosedWorkPullRequests } from "../find-closed-work-pull-request/index.js";
import { releaseClosedBlockers } from "../release-closed-blockers/index.js";
import { waitForChecks } from "../wait-for-checks/index.js";
import { withdrawSpecs } from "../withdraw-specs/index.js";
import type { CloseWorkReport, RunCloseWorkInput } from "./run-close-work.type.js";

const DEFAULT_TIMEOUT_MINUTES = 30;
const DEFAULT_INTERVAL_MS = 30_000;
/** How many failing checks a row names. */
const MAX_NAMED = 8;

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/** Runs `holocron close work`; see the file's comment. */
export async function runCloseWork(input: RunCloseWorkInput): Promise<CloseWorkReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const rows: CheckRow[] = [];
	let found: CloseWorkReport["pullRequest"];
	const finish = (): CloseWorkReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows, ...(found ? { pullRequest: found } : {}) };
	};
	const fail = (id: string, detail: string): CloseWorkReport => {
		rows.push(row(id, "fail", detail));
		return finish();
	};
	print(style.header(`Holocron close work${input.abandon ? " --abandon" : ""}${dryRun ? " (dry-run)" : ""}`));
	print("");

	const key = input.issue.trim();
	if (!key) return fail("issue", "the issue is empty");
	if (input.timeoutMinutes !== undefined && !(input.timeoutMinutes > 0)) {
		return fail("timeout", "--timeout is a number of minutes above zero");
	}
	if (input.abandon && (input.wait || input.timeoutMinutes !== undefined)) {
		return fail("abandon", "--wait and --timeout wait for the checks of a pull request that is going to be closed");
	}

	// The providers.
	const providers = input.loaded.resolved.providers;
	if (!providers.issues) return fail(key, "the config has no `issues` provider");
	if (!providers.source) return fail(key, "the config has no `source` provider to find the pull request with");
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{
				...input.loaded.resolved,
				providers: {
					issues: providers.issues,
					source: providers.source,
					...(providers.projects ? { projects: providers.projects } : {}),
					...(providers.notifications ? { notifications: providers.notifications } : {}),
					...(providers.credentials ? { credentials: providers.credentials } : {}),
				},
			},
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "close work");
	for (const cap of ["issues", "source"] as const) {
		if (!loader.has(cap)) {
			const failure = loader.loadFailures().find((f) => f.key === cap);
			return fail(
				key,
				`the \`${cap}\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			);
		}
	}
	const issues = loader.get("issues");
	const source = loader.get("source");

	// A write needs a yes: the flag, or a terminal to ask.
	const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
	if (!dryRun && !input.yes && !interactive) {
		throw new NonInteractiveError(
			"`close work` writes to the pull request, the tracker and this checkout; pass --yes to run it without asking, or --dry-run to preview"
		);
	}
	/* v8 ignore next -- inquirer only runs outside tests, which inject `confirm` */
	const ask = input.confirm ?? ((message: string) => confirm({ message, default: false }));

	// The pull request: the open one, else (for a close) the merged one.
	let pr: PullRequest | undefined;
	try {
		if (input.pullRequest !== undefined) {
			if (!source.getPullRequest)
				throw new Error(`the \`${source.providerName}\` provider cannot read a pull request`);
			pr = await source.getPullRequest(input.pullRequest);
		} else {
			if (!source.listPullRequests)
				throw new Error(`the \`${source.providerName}\` provider cannot list pull requests`);
			const open = findWorkPullRequests(await source.listPullRequests("open"), key);
			pr = open[0];
			if (open.length > 1) {
				rows.push(
					row(
						"pull request",
						"skip",
						`${open.length} open pull requests match ${key}; using #${pr?.number} (--pr names another)`
					)
				);
			}
			if (!pr && !input.abandon) pr = findClosedWorkPullRequests(await source.listPullRequests("closed"), key)[0];
		}
	} catch (err) {
		return fail("pull request", `could not find the pull request: ${describeError(err)}`);
	}
	if (pr) {
		found = {
			number: pr.number,
			url: pr.url,
			state: pr.state === "open" ? "open" : pr.merged ? "merged" : "closed",
		};
	}

	// The other ending.
	if (input.abandon) {
		const abandoned = await abandonWork({
			input: {
				...input,
				withdrawSpecs: input.withdrawSpecs ?? ((files) => withdrawSpecs(input.loaded, input.context, files)),
			},
			key,
			source,
			loader,
			ask,
			...(pr ? { pullRequest: pr } : {}),
		});
		if (abandoned.cancelled) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
		rows.push(...abandoned.rows);
		return finish();
	}

	if (!pr)
		return fail("pull request", `no pull request for ${key} (its branch is <type>/<issue>-<slug>; --pr names one)`);
	const git = input.git ?? runGit;
	const repoRoot = input.context.repoRoot;

	// A merged pull request: the clean-up.
	if (pr.state === "closed") {
		if (!pr.merged) {
			rows.push(
				row(
					"pull request",
					"skip",
					`#${pr.number} was closed without merging; \`close work ${key} --abandon\` tidies its branch and spec`
				)
			);
			return finish();
		}
		rows.push(row("pull request", "ok", `#${pr.number} merged: ${pr.title}`));
		if (!dryRun && !input.yes && !(await ask(`Remove the worktree and local branch of ${pr.branch}?`))) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
		rows.push(
			...cleanUpWork({
				git,
				repoRoot,
				branch: pr.branch,
				dryRun,
				mode: "merged",
				...(pr.headSha ? { headSha: pr.headSha } : {}),
				...(input.keepWorktree ? { keepWorktree: true } : {}),
			})
		);
		return finish();
	}

	// An open pull request: read the aggregate, each time.
	rows.push(row("pull request", "ok", `#${pr.number} ${pr.title}`));
	if (!source.getPullRequestChecks) {
		return fail(
			"ci / Required checks",
			`the \`${source.providerName}\` provider cannot read a pull request's checks`
		);
	}
	const readChecks = source.getPullRequestChecks.bind(source);
	const number = pr.number;
	const minutes = input.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
	let result;
	try {
		result = await waitForChecks({
			read: () => readChecks(number),
			wait: Boolean(input.wait),
			timeoutMs: minutes * 60_000,
			intervalMs: input.intervalMs ?? DEFAULT_INTERVAL_MS,
			now: input.now ?? Date.now,
			sleep: input.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms))),
			onPoll: (state, polls) =>
				print(`  ${style.skip(`waiting: ci / Required checks is ${state.state} (read ${polls})`)}`),
		});
	} catch (err) {
		return fail("ci / Required checks", `could not read the aggregate: ${describeError(err)}`);
	}
	const { checks } = result;
	if (checks.state !== "success") {
		const failing = checks.failing.slice(0, MAX_NAMED).map((c) => (c.url ? `${c.name} (${c.url})` : c.name));
		const more = checks.failing.length - failing.length;
		const named = failing.length > 0 ? `: ${failing.join(", ")}${more > 0 ? `, and ${more} more` : ""}` : "";
		const why =
			checks.state === "failure"
				? `is red${named}`
				: result.timedOut
					? `is still ${checks.state} after ${minutes} minute${minutes === 1 ? "" : "s"}`
					: `is ${checks.state === "none" ? "not posted yet" : "still running"}; --wait polls until it is green`;
		return fail(
			"ci / Required checks",
			`${why}. #${number} was not marked ready; run \`close work ${key}\` again once it is green`
		);
	}
	rows.push(row("ci / Required checks", "ok", `green${checks.sha ? ` on ${checks.sha.slice(0, 7)}` : ""}`));

	// Green: ask once, then the steps that write.
	if (!dryRun && !input.yes) {
		const plan = `Mark #${number} ready, update the area labels and take closed blockers off ${key}`;
		if (!(await ask(`${key} is green. ${plan}?`))) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	// Mark ready.
	if (!source.markReady) {
		rows.push(row("ready", "fail", `the \`${source.providerName}\` provider cannot mark a pull request ready`));
	} else if (dryRun) {
		rows.push(row("ready", "skip", `would mark #${number} ready if it is a draft`));
	} else {
		try {
			const changed = await source.markReady(number);
			rows.push(
				row(
					"ready",
					"ok",
					changed
						? `#${number} is ready for review; the board moves to In Review by itself. The maintainer merges, \`close work ${key}\` again after that clears the checkout`
						: `#${number} was already ready; the maintainer merges`
				)
			);
		} catch (err) {
			rows.push(row("ready", "fail", `could not mark #${number} ready: ${describeError(err)}`));
		}
	}

	// The area labels, as `update work` writes them (add-only).
	try {
		const updated = await (input.updateWork ?? runUpdateWork)({
			issue: key,
			loaded: input.loaded,
			context: input.context,
			loader,
			yes: true,
			pullRequest: number,
			print: () => {},
		});
		for (const r of updated.rows) rows.push({ ...r, id: `labels: ${r.id}`, title: `labels: ${r.title}` });
	} catch (err) {
		rows.push(row("labels", "fail", `could not update the area labels: ${describeError(err)}`));
	}

	// The issue's relations.
	rows.push(
		...(await releaseClosedBlockers({
			issues,
			key,
			unblock: (keys) =>
				(input.updateIssue ?? runIssueUpdate)({
					key,
					unblock: keys,
					loaded: input.loaded,
					context: input.context,
					loader,
					yes: true,
					print: () => {},
				}),
		}))
	);
	return finish();
}
