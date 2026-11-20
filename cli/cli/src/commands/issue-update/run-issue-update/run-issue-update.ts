/**
 * `holocron update issue` — changes an issue through the repo's `issues` provider (spec `tool-work-commands`, #2429).
 *
 * It edits only the tracker's issue: title, text, state, labels, assignees, milestone and the fields of
 * `IssueFields` (type, priority, effort, dates, parent, blockers), and, with `--project`, puts the issue on a declared
 * board. A field not named is left alone and nothing is cleared unless `--clear` names it. It writes to a tracker, so it
 * asks first unless `--dry-run` or `--yes` (without a terminal it refuses instead). `update work` is another command,
 * which spans the pull request and the board.
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

import { assertPluginsResolvable, type IssuePatch, PluginLoader } from "../../../plugin/index.js";
import { addIssueToBoard } from "../../issue-fields/add-issue-to-board/index.js";
import { describeIssueFields } from "../../issue-fields/describe-issue-fields/index.js";
import { prepareIssueFields } from "../../issue-fields/prepare-issue-fields/index.js";
import type { IssueUpdateReport, RunIssueUpdateInput } from "./run-issue-update.type.js";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

const list = (values: readonly string[] | undefined) => [
	...new Set((values ?? []).map((v) => v.trim()).filter(Boolean)),
];

/** Runs `holocron update issue`: checks the flags, asks, calls `Issues.update`, then adds the issue to the board for `--project`. */
export async function runIssueUpdate(input: RunIssueUpdateInput): Promise<IssueUpdateReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const finish = (rows: CheckRow[], changed?: string[]): IssueUpdateReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows, ...(changed ? { changed } : {}) };
	};
	print(style.header(`Holocron update issue${dryRun ? " (dry-run)" : ""}`));
	print("");

	const key = input.key.trim();
	if (!key) return finish([row("key", "fail", "the issue key is empty")]);

	const prepared = prepareIssueFields(input, input.loaded.resolved.repo?.labels?.areas);
	const problems = prepared.ok ? [] : [...prepared.problems];
	const clear = [...new Set(input.clear ?? [])];
	const addLabels = list([...(input.addLabels ?? []), ...(prepared.ok ? prepared.areaLabels : [])]);
	const removeLabels = list(input.removeLabels);
	const assignees = list(input.assignees);
	const unblock = list(input.unblock);
	const title = input.title?.trim();
	const milestone = input.milestone?.trim();

	if (input.title !== undefined && !title) problems.push("--title is empty");
	if (input.milestone !== undefined && !milestone) problems.push("--milestone is empty");
	const set: Record<string, boolean> = {
		assignees: assignees.length > 0,
		milestone: Boolean(milestone),
		parent: Boolean(input.parent?.trim()),
		kind: Boolean(input.kind),
		priority: Boolean(input.priority),
		effort: Boolean(input.effort),
		startDate: Boolean(input.startDate),
		targetDate: Boolean(input.targetDate),
	};
	for (const field of clear) if (set[field]) problems.push(`${field} is both set and cleared; choose one`);
	for (const label of addLabels) {
		if (removeLabels.some((r) => r.toLowerCase() === label.toLowerCase())) {
			problems.push(`the label "${label}" is both added and removed`);
		}
	}
	const blockers = prepared.ok ? (prepared.fields.blockedBy ?? []) : [];
	for (const k of unblock) if (blockers.includes(k)) problems.push(`${k} is both added and removed as a blocker`);
	if (problems.length > 0) return finish(problems.map((p) => row(key, "fail", p)));
	if (!prepared.ok) return finish([row(key, "fail", "the options are not valid")]);

	const patch: IssuePatch = {
		...prepared.fields,
		...(title ? { title } : {}),
		...(input.body !== undefined ? { body: input.body } : {}),
		...(input.state ? { state: input.state } : {}),
		...(addLabels.length > 0 ? { addLabels } : {}),
		...(removeLabels.length > 0 ? { removeLabels } : {}),
		...(assignees.length > 0 ? { assignees } : {}),
		...(milestone ? { milestone } : {}),
		...(unblock.length > 0 ? { unblock } : {}),
		...(clear.length > 0 ? { clear } : {}),
	};
	const details = [
		...(title ? ["title"] : []),
		...(input.body !== undefined ? ["body"] : []),
		...(input.state ? [`state: ${input.state}`] : []),
		...(addLabels.length > 0 ? [`add labels: ${addLabels.join(", ")}`] : []),
		...(removeLabels.length > 0 ? [`remove labels: ${removeLabels.join(", ")}`] : []),
		...(assignees.length > 0 ? [`assignee: ${assignees.join(", ")}`] : []),
		...(milestone ? [`milestone: ${milestone}`] : []),
		...describeIssueFields(prepared.fields, prepared.project),
		...(unblock.length > 0 ? [`unblock: ${unblock.join(", ")}`] : []),
		...(clear.length > 0 ? [`clear: ${clear.join(", ")}`] : []),
	];
	if (details.length === 0) {
		return finish([row(key, "fail", "nothing to change; name a field to set, or `--clear` one")]);
	}
	const summary = ` (${details.join("; ")})`;

	const entry = input.loaded.resolved.providers.issues;
	if (!entry) return finish([row(key, "fail", "the config has no `issues` provider to update the issue with")]);
	const credentials = input.loaded.resolved.providers.credentials;
	const projects = prepared.project ? input.loaded.resolved.providers.projects : undefined;
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{
				...input.loaded.resolved,
				providers: {
					issues: entry,
					...(projects ? { projects } : {}),
					...(credentials ? { credentials } : {}),
				},
			},
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "update issue");
	if (!loader.has("issues")) {
		const failure = loader.loadFailures().find((f) => f.key === "issues");
		return finish([
			row(
				key,
				"fail",
				`the \`issues\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			),
		]);
	}
	const issues = loader.get("issues");
	if (!issues.update) {
		return finish([row(key, "fail", `the \`${issues.providerName}\` provider does not support \`update issue\``)]);
	}

	if (dryRun) {
		const board = prepared.project
			? await addIssueToBoard({
					loaded: input.loaded,
					context: input.context,
					loader,
					board: prepared.project,
					key,
					dryRun: true,
				})
			: undefined;
		return finish([row(key, "skip", `would update the issue${summary}`), ...(board ? [board] : [])]);
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				"`update issue` changes an issue; pass --yes to run it without asking, or --dry-run to preview"
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Update ${key}${summary}?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was changed")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	try {
		const result = await issues.update(key, patch);
		const board = prepared.project
			? await addIssueToBoard({
					loaded: input.loaded,
					context: input.context,
					loader,
					board: prepared.project,
					key: result.key,
					...(prepared.fields.priority ? { priority: prepared.fields.priority } : {}),
				})
			: undefined;
		return finish(
			[
				row(
					result.key,
					"ok",
					result.changed.length > 0
						? `updated: ${result.changed.join("; ")}`
						: "already as asked; nothing changed"
				),
				...(result.dropped ?? []).map((line) => row("not carried across", "skip", line)),
				...(board ? [board] : []),
			],
			result.changed
		);
	} catch (err) {
		return finish([row(key, "fail", `could not update the issue: ${describeError(err)}`)]);
	}
}
