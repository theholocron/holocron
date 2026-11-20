/**
 * `holocron update work [issue]` — keeps one piece of work's issue, pull request and board in step (spec
 * `tool-work-commands`, #2429, part 5).
 *
 * In order: `--start` runs `start work` (the same function) so the branch and the draft pull request exist; the issue's
 * fields go through `update issue`; the pull request, found by its `<type>/<issue>-<slug>` branch or `--pr`, gets the
 * fields it shares (title, labels, milestone, assignees, board) through `Source.updatePullRequest`; the `area:<name>`
 * labels its changed folders earn (`repo.labels.areas`, `areaLabelsForFiles()`) are added to the issue and the pull
 * request, never removed (a label a person put there stays); and `--status` last sets the board status through
 * `project status`. In Review, Blocked and Done belong to the board's automation and are refused unless `--force`; any
 * status set by hand is temporary, and the run says so.
 *
 * It writes to the tracker, GitHub and the board, so it asks once first unless `--dry-run` or `--yes` (without a
 * terminal it refuses). `--dry-run` runs the reads and writes nothing. A run with nothing to change still syncs the
 * area labels.
 */

import { confirm } from "@inquirer/prompts";
import {
	type CheckRow,
	describeError,
	NonInteractiveError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import {
	assertPluginsResolvable,
	PluginLoader,
	type PullRequest,
	type PullRequestPatch,
} from "../../../plugin/index.js";
import { resolveAreaLabels } from "../../issue-fields/resolve-area-labels/index.js";
import { runIssueUpdate } from "../../issue-update/run-issue-update/index.js";
import { runProjectStatus } from "../../project/project-status/index.js";
import { runStartWork } from "../../start-work/run-start-work/index.js";
import { areaLabelsForFiles } from "../area-labels-for-files/index.js";
import { findWorkPullRequests } from "../find-work-pull-request/index.js";
import { guardWorkStatus } from "../guard-work-status/index.js";
import type { RunUpdateWorkInput, UpdateWorkReport } from "./run-update-work.type.js";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

const unique = (values: readonly string[] | undefined) => [
	...new Set((values ?? []).map((v) => v.trim()).filter(Boolean)),
];

/** The lines of a sub-run, kept instead of printed so the run prints one table. */
const quiet = () => {
	const lines: string[] = [];
	return { lines, print: (line: string) => void lines.push(line) };
};

/** Runs `holocron update work`; see the file's comment. */
export async function runUpdateWork(input: RunUpdateWorkInput): Promise<UpdateWorkReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const rows: CheckRow[] = [];
	let report: Partial<UpdateWorkReport> = {};
	const finish = (): UpdateWorkReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows, ...report };
	};
	const fail = (id: string, detail: string): UpdateWorkReport => {
		rows.push(row(id, "fail", detail));
		return finish();
	};
	print(style.header(`Holocron update work${dryRun ? " (dry-run)" : ""}`));
	print("");

	const key = input.issue.trim();
	if (!key) return fail("issue", "the issue is empty");

	// The checks that need no service, so a refused status writes nothing.
	const status = input.status?.trim();
	if (input.status !== undefined && !status) return fail("status", "--status is empty");
	if (input.force && !status) return fail("status", "--force only goes with --status");
	const guard = status ? guardWorkStatus(status, input.force) : undefined;
	if (guard && !guard.ok) return fail("status", guard.problem);
	const title = input.title?.trim();
	if (input.title !== undefined && !title) return fail("title", "--title is empty");
	const areas = input.loaded.resolved.repo?.labels?.areas;
	const named = resolveAreaLabels(input.areas ?? [], areas);
	if (!named.ok) return fail("area", named.problem);
	const addLabels = unique([...(input.addLabels ?? []), ...named.labels]);
	const removeLabels = unique(input.removeLabels);
	const assignees = unique(input.assignees);
	const milestone = input.milestone?.trim();

	const issueChanges =
		Boolean(input.issueTitle?.trim()) ||
		addLabels.length > 0 ||
		removeLabels.length > 0 ||
		assignees.length > 0 ||
		Boolean(milestone) ||
		unique(input.unblock).length > 0 ||
		Boolean(
			input.kind ??
			input.priority ??
			input.effort ??
			input.startDate ??
			input.targetDate ??
			input.parent ??
			input.project ??
			input.blockedBy?.length
		);

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
					...(providers.credentials ? { credentials: providers.credentials } : {}),
				},
			},
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "update work");
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

	const plan = [
		...(input.start ? ["start work"] : []),
		...(issueChanges ? ["the issue's fields"] : []),
		"the pull request's fields",
		"area labels from the changed folders",
		...(status ? [`board status ${status}`] : []),
	];
	if (!dryRun && !input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				"`update work` writes to the tracker, the pull request and the board; pass --yes to run it without asking, or --dry-run to preview"
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Update the work on ${key}: ${plan.join(", ")}?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	// Step 1: start work.
	if (input.start) {
		const sub = quiet();
		const started = await (input.startWork ?? runStartWork)({
			issue: key,
			loaded: input.loaded,
			context: input.context,
			yes: true,
			print: sub.print,
			...(input.loader ? { loader: input.loader } : {}),
			...(title ? { title } : {}),
			...(input.name ? { name: input.name } : {}),
			...(input.base ? { base: input.base } : {}),
			...(input.spec ? { spec: input.spec } : {}),
			...(input.onePr ? { onePr: true } : {}),
			...(input.effort ? { effort: input.effort } : {}),
			...(input.kind ? { kind: input.kind } : {}),
			...(assignees.length > 0 ? { assignees } : {}),
			...(input.project ? { project: input.project } : {}),
		});
		for (const r of started.rows) rows.push({ ...r, id: `start: ${r.id}`, title: `start: ${r.title}` });
		if (started.status === "fail") {
			rows.push(row("update work", "skip", "start work failed, so nothing after it was run"));
			return finish();
		}
	}

	// Step 2: the pull request.
	let pr: PullRequest | undefined;
	try {
		if (input.pullRequest !== undefined) {
			if (!source.getPullRequest)
				throw new Error(`the \`${source.providerName}\` provider cannot read a pull request`);
			pr = await source.getPullRequest(input.pullRequest);
		} else if (source.listPullRequests) {
			const found = findWorkPullRequests(await source.listPullRequests("open"), key);
			pr = found[0];
			if (found.length > 1) {
				rows.push(
					row(
						"pull request",
						"skip",
						`${found.length} open pull requests match ${key}; using #${pr?.number} (--pr names another)`
					)
				);
			}
		}
	} catch (err) {
		rows.push(row("pull request", "fail", `could not find the pull request: ${describeError(err)}`));
		return finish();
	}
	if (pr) {
		report = { ...report, pullRequest: { number: pr.number, url: pr.url } };
		rows.push(row("pull request", "ok", `#${pr.number} ${pr.title}`));
	} else {
		const detail = `no open pull request for ${key} (its branch is <type>/<issue>-<slug>; --pr names one, --start makes one)`;
		rows.push(row("pull request", title ? "fail" : "skip", title ? `${detail}; --title needs one` : detail));
	}

	// Step 3: the area labels from the changed folders.
	let derived: string[] = [];
	if (!pr) rows.push(row("area labels", "skip", "no pull request to read the changed folders of"));
	else if (!areas || Object.keys(areas).length === 0)
		rows.push(row("area labels", "skip", "the repo declares no `repo.labels.areas`"));
	else if (!source.listPullRequestFiles)
		rows.push(
			row("area labels", "skip", `the \`${source.providerName}\` provider cannot list a pull request's files`)
		);
	else {
		try {
			derived = areaLabelsForFiles(await source.listPullRequestFiles(pr.number), areas);
			report = { ...report, areaLabels: derived };
			rows.push(
				row(
					"area labels",
					derived.length > 0 ? "ok" : "skip",
					derived.length > 0 ? derived.join(", ") : "the changed folders are in no area"
				)
			);
		} catch (err) {
			rows.push(row("area labels", "fail", `could not read the changed files: ${describeError(err)}`));
		}
	}
	// Only the missing ones go to the issue, so the row says what changed; the pull request's own are not readable here, so it is sent all.
	let missingOnIssue = derived;
	if (derived.length > 0 && issues.export) {
		try {
			const have = ((await issues.export({ keys: [key] }))[0]?.labels ?? []).map((l) => l.toLowerCase());
			missingOnIssue = derived.filter((l) => !have.includes(l.toLowerCase()));
		} catch {
			// The labels could not be read: send all of them, adding one that is there changes nothing.
		}
	}

	// Step 4: the issue.
	const issueAdd = unique([...addLabels, ...missingOnIssue]);
	if (issueChanges || issueAdd.length > 0) {
		const sub = quiet();
		const updated = await (input.updateIssue ?? runIssueUpdate)({
			key,
			loaded: input.loaded,
			context: input.context,
			loader,
			yes: true,
			print: sub.print,
			...(input.issueTitle?.trim() ? { title: input.issueTitle.trim() } : {}),
			...(issueAdd.length > 0 ? { addLabels: issueAdd } : {}),
			...(removeLabels.length > 0 ? { removeLabels } : {}),
			...(assignees.length > 0 ? { assignees } : {}),
			...(milestone ? { milestone } : {}),
			...(input.unblock?.length ? { unblock: input.unblock } : {}),
			...(input.kind ? { kind: input.kind } : {}),
			...(input.priority ? { priority: input.priority } : {}),
			...(input.effort ? { effort: input.effort } : {}),
			...(input.startDate ? { startDate: input.startDate } : {}),
			...(input.targetDate ? { targetDate: input.targetDate } : {}),
			...(input.parent ? { parent: input.parent } : {}),
			...(input.blockedBy?.length ? { blockedBy: input.blockedBy } : {}),
			...(input.project ? { project: input.project } : {}),
		});
		for (const r of updated.rows) rows.push({ ...r, id: `issue: ${r.id}`, title: `issue: ${r.title}` });
	} else {
		rows.push(row("issue", "skip", "no issue field to change"));
	}

	// Step 5: the pull request's fields.
	if (pr) {
		const prLabels = unique([...addLabels, ...derived]);
		const patch: PullRequestPatch = {
			...(title ? { title } : {}),
			...(prLabels.length > 0 ? { labels: prLabels } : {}),
			...(removeLabels.length > 0 ? { removeLabels } : {}),
			...(assignees.length > 0 ? { assignees } : {}),
			...(milestone ? { milestone } : {}),
			...(input.project ? { projects: [input.project] } : {}),
		};
		const parts = [
			...(title ? [`title "${title}"`] : []),
			...(prLabels.length > 0 ? [`labels ${prLabels.join(", ")}`] : []),
			...(removeLabels.length > 0 ? [`remove ${removeLabels.join(", ")}`] : []),
			...(assignees.length > 0 ? [`assignees ${assignees.join(", ")}`] : []),
			...(milestone ? [`milestone ${milestone}`] : []),
			...(input.project ? [`board ${input.project}`] : []),
		];
		if (parts.length === 0) rows.push(row(`pull request #${pr.number}`, "skip", "no field to change"));
		else if (!source.updatePullRequest)
			rows.push(
				row(
					`pull request #${pr.number}`,
					"fail",
					`the \`${source.providerName}\` provider cannot update a pull request`
				)
			);
		else if (dryRun) rows.push(row(`pull request #${pr.number}`, "skip", `would update ${parts.join("; ")}`));
		else {
			try {
				const result = await source.updatePullRequest(pr.number, patch);
				rows.push(row(`pull request #${pr.number}`, "ok", `updated ${parts.join("; ")}`));
				for (const line of result.dropped) rows.push(row("not carried across", "skip", line));
			} catch (err) {
				rows.push(
					row(
						`pull request #${pr.number}`,
						"fail",
						`could not update the pull request: ${describeError(err)}`
					)
				);
			}
		}
	}

	// Step 6: the board status, last.
	if (status) {
		const sub = quiet();
		try {
			const set = await (input.setStatus ?? runProjectStatus)({
				issue: key,
				status,
				loaded: input.loaded,
				context: input.context,
				loader,
				print: sub.print,
				...(input.board ? { board: input.board } : {}),
			});
			const change =
				set.key && set.to ? `${set.key} ${set.from ?? "no status"} → ${set.to}` : `${key} → ${status}`;
			rows.push(
				set.status === "ok"
					? row("board status", dryRun ? "skip" : "ok", dryRun ? `would set ${change}` : change)
					: row(
							"board status",
							"fail",
							sub.lines
								.map((l) => l.trim())
								.filter(Boolean)
								.join("; ") || "could not set the status"
						)
			);
		} catch (err) {
			rows.push(row("board status", "fail", describeError(err)));
		}
		rows.push(
			row(
				"board status is temporary",
				"skip",
				guard?.ok && guard.forced
					? "forced: the automation owns this status and overwrites it once it runs again (#2388)"
					: "the board's rules overwrite a hand-set status once the pull request moves it (#2388)"
			)
		);
	}
	return finish();
}
