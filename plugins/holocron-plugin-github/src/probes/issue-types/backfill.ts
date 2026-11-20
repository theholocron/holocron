import type { ProbeContext } from "@theholocron/cli";
import { areaLabelsForFiles, areaLabelsForTitle } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { gather } from "./gather.js";
import type { AreaConfig, BackfillApi, BackfillItem, BackfillOptions } from "./issue-types.type.js";
import { planType } from "./plan-type.js";
import { reportBackfill, type Tally } from "./report.js";

/** Everything one run needs: where to say and write, what to read from, what was asked and what the repo declares. */
export interface BackfillRun {
	ctx: ProbeContext;
	api: BackfillApi;
	options: BackfillOptions;
	areas: AreaConfig;
	isRateLimited: (err: unknown) => boolean;
}

/** What is known once, before the first issue. */
interface Setup {
	labelNames: Set<string>;
	milestone?: number;
	projectId?: string;
	/** The issue fields (`priority`, `effort`) the organization defines, which the lacking lists cover. */
	fields: string[];
}

/** The numbers the report is made of. */
const emptyTally = (): Tally => ({
	examined: 0,
	pullRequestsSkipped: 0,
	typeSet: {},
	typed: 0,
	noKind: 0,
	ambiguous: [],
	areaLabelsAdded: 0,
	missingAreaLabels: new Set(),
	milestoneSet: { parent: 0, explicit: 0 },
	projectSet: 0,
	lacking: { project: [], milestone: [], priority: [], effort: [] },
	failed: 0,
	changed: 0,
	pullRequestsRead: 0,
	last: undefined,
	skippedFields: undefined,
});

/** How many changes the tally holds, to tell whether one item added any. */
const changes = (t: Tally) =>
	Object.values(t.typeSet).reduce((a, b) => a + b, 0) +
	t.areaLabelsAdded +
	t.milestoneSet.parent +
	t.milestoneSet.explicit +
	t.projectSet;

/** How an issue is named in a row. */
const labelOf = (item: BackfillItem) => `#${item.number}`;

/** Reads what the run needs before it starts: labels, the named milestone and project, the organization's issue fields. Says why and returns nothing when a name does not exist. */
async function prepare(run: BackfillRun, tally: Tally): Promise<Setup | undefined> {
	const { api, ctx, options } = run;
	const setup: Setup = { labelNames: await api.labelNames(), fields: [] };
	if (options.milestone !== undefined) {
		setup.milestone = await api.milestoneNumber(options.milestone);
		if (setup.milestone === undefined) {
			ctx.say({
				status: "fail",
				label: "milestone",
				detail: `${options.milestone} is not a milestone of this repository`,
			});
			return undefined;
		}
	}
	if (options.project !== undefined) {
		setup.projectId = await api.projectId(options.project);
		if (setup.projectId === undefined) {
			ctx.say({
				status: "fail",
				label: "project",
				detail: `${options.project} is not a project of this organization`,
			});
			return undefined;
		}
	}
	const names = await api.fieldNames();
	if (typeof names === "string") tally.skippedFields = names;
	else setup.fields = ["priority", "effort"].filter((f) => names.has(f));
	return setup;
}

/** Does one issue or pull request; throws for a rate limit or a failed request, which the caller tells apart. */
async function handle(
	run: BackfillRun,
	setup: Setup,
	tally: Tally,
	item: BackfillItem,
	projects: string[]
): Promise<void> {
	const { api, ctx, areas, options } = run;
	const n = item.number;

	const wanted = item.isPullRequest
		? areaLabelsForFiles(await api.files(n), areas.areas)
		: areaLabelsForTitle(item.title, areas.scopes);
	const have = new Set(item.labels.map((l) => l.toLowerCase()));
	const add: string[] = [];
	for (const label of wanted) {
		if (have.has(label.toLowerCase())) continue;
		if (setup.labelNames.has(label.toLowerCase())) add.push(label);
		else tally.missingAreaLabels.add(label);
	}
	if (add.length > 0) {
		await ctx.write(`add ${add.join(", ")} to ${labelOf(item)}`, () => api.addLabels(n, add));
		tally.areaLabelsAdded++;
	}
	if (item.isPullRequest) return;

	const type = planType(item);
	if ("set" in type) {
		await ctx.write(`set Type ${type.set} on ${labelOf(item)}`, () => api.setType(n, type.set));
		tally.typeSet[type.set] = (tally.typeSet[type.set] ?? 0) + 1;
	} else if (type.skip === "typed") tally.typed++;
	else if (type.skip === "no-kind-label") tally.noKind++;
	else tally.ambiguous.push({ number: n, labels: type.labels });

	// A milestone comes from the issue's parent when it has one, else from `--milestone` for an issue in the window.
	let milestone = item.milestone !== null;
	if (!milestone) {
		const parent = await api.parent(n);
		const fromParent = parent?.milestone;
		const target = fromParent ?? setup.milestone;
		if (target !== undefined) {
			const source = typeof fromParent === "number" ? "parent" : "explicit";
			const why =
				source === "parent" ? `from its parent #${parent?.number}` : `from --milestone ${options.milestone}`;
			await ctx.write(`set milestone on ${labelOf(item)} ${why}`, () => api.setMilestone(n, target));
			tally.milestoneSet[source]++;
			milestone = true;
		}
	}
	if (!milestone) tally.lacking.milestone.push(item);

	// A project comes only from `--project`, for an issue in the window that is on none; one on any project is left alone.
	let onProject = projects.length > 0;
	if (!onProject && setup.projectId !== undefined) {
		const id = setup.projectId;
		await ctx.write(`add ${labelOf(item)} to project ${options.project}`, () => api.addToProject(id, item.nodeId));
		tally.projectSet++;
		onProject = true;
	}
	if (!onProject) tally.lacking.project.push(item);

	if (setup.fields.length > 0) {
		const values = await api.fieldValues(n);
		for (const field of setup.fields) {
			if (!values.has(field)) tally.lacking[field as "priority" | "effort"].push(item);
		}
	}
}

/**
 * The backfill of `holocron probe github issue-types` (spec `tech-github-area-labels`, rollout item 5): reads a window of
 * issues, and for each adds what it can derive and nothing else.
 *
 * - **Type** from the kind labels (`bug`, `enhancement`, `chore`, else Task for `ci`, `documentation`, `refactor`, `test`,
 *   `performance`, `dependencies`); one that has a Type keeps it, one with two kind labels
 *   is listed and left.
 * - **Area labels** from the title's scope, or, for a pull request with `--pull-requests`, from its changed files; only
 *   added, and only when the label exists (`holocron setup` makes them).
 * - **Milestone** from the issue's parent, else `--milestone` for an issue in the window named by `--issues` or `--since`.
 * - **Project** from `--project` for such an issue that is on no project.
 *
 * Nothing is overwritten and no label is removed. Priority and Effort are never set, only listed when missing. Every
 * change goes through `ctx.write`, so `--dry-run` says `would ...` and writes nothing. A rate limit ends the run with the
 * cursor to resume from; any other failure is a row for that issue and the run goes on.
 */
export async function runBackfill(run: BackfillRun): Promise<void> {
	const { ctx, api, options } = run;
	const tally = emptyTally();
	const setup = await prepare(run, tally);
	if (!setup) return;
	const read = await gather(api, options, run.isRateLimited);
	tally.pullRequestsSkipped = read.pullRequestsSkipped;

	const projects = new Map<string, string[]>();
	const ids = read.items.filter((i) => !i.isPullRequest).map((i) => i.nodeId);
	try {
		for (let at = 0; at < ids.length; at += 100) {
			for (const [id, found] of await api.projectsOf(ids.slice(at, at + 100))) projects.set(id, found);
		}
	} catch (err) {
		if (!run.isRateLimited(err)) throw err;
		read.rateLimited = true;
		read.more = true;
		read.items.length = 0;
	}

	let stopped = read.rateLimited;
	for (const item of read.items) {
		const before = changes(tally);
		try {
			await handle(run, setup, tally, item, projects.get(item.nodeId) ?? []);
			if (changes(tally) > before) tally.changed++;
		} catch (err) {
			if (run.isRateLimited(err)) {
				stopped = true;
				break;
			}
			ctx.say({ status: "fail", label: labelOf(item), detail: errorMessage(err) });
			tally.failed++;
		}
		tally.examined++;
		if (item.isPullRequest) tally.pullRequestsRead++;
		tally.last = item.number;
	}
	reportBackfill(ctx, {
		tally,
		options,
		dryRun: ctx.dryRun,
		more: read.more || stopped,
		rateLimited: stopped,
		fields: setup.fields,
	});
}
