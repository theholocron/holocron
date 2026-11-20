/**
 * The fields of a GitHub issue beyond its title, text, labels and assignees, and `Issues.update`, for `holocron new
 * issue` and `holocron update issue` (#2429, spec `tool-work-commands`).
 *
 * - Type (Bug, Feature, Task) is the issue's `type`, written with the issues API.
 * - Priority, Effort, Start date and Target date are the organization's issue fields (`issue-field-setter.ts`).
 * - Parent is a sub-issue link and blocked-by a dependency, both written with the issues API by the issue's numeric id.
 *
 * A field GitHub refuses (401, 403, 404, 422: no such Type, no such field, no such issue) is a `dropped` line, never a
 * failure; a rate limit and every other error are thrown. A link or field already as asked is not written again.
 *
 * Not verified against the live API: writing Type, Effort and the dates, the sub-issue and dependency endpoints.
 */

import type {
	IssueClearable,
	IssueEffort,
	IssueFields,
	IssueKind,
	IssuePatch,
	IssueUpdateResult,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";

import { createFieldSetter, fieldRefusal, type FieldSetter } from "./issue-field-setter.js";
import { PRIORITY_OPTION_NAMES } from "./issue-priority.js";

const KIND_NAMES: Record<IssueKind, string> = { bug: "Bug", feature: "Feature", task: "Task" };
const EFFORT_NAMES: Record<IssueEffort, string> = { high: "High", medium: "Medium", low: "Low" };

/** What the field writers need to know about the repository. */
export interface FieldContext {
	client: GitHubClient;
	/** `owner/name`. */
	repo: string;
	/** Reads the issue number out of a key (`#7`, `7`, `owner/name#7`); throws for another repository's key. */
	parseKey: (key: string) => number;
	/** Shared by the calls of one run, so the organization's field list is read once. */
	fields?: FieldSetter;
}

/** What {@link applyIssueFields} did. */
export interface FieldsOutcome {
	changed: string[];
	dropped: string[];
}

/** Runs one step; a refusal or a bad key is a `dropped` line, anything else (a rate limit) is thrown. */
async function guarded(what: string, out: FieldsOutcome, step: () => Promise<void>): Promise<void> {
	try {
		await step();
	} catch (err) {
		const why = fieldRefusal(err);
		if (why !== undefined) out.dropped.push(`${what} (${why})`);
		else if (!(err instanceof ProviderApiError)) out.dropped.push(`${what} (${(err as Error).message})`);
		else throw err;
	}
}

const CLEAR_FIELD: Partial<Record<IssueClearable, { name: string; type: "select" | "date" }>> = {
	priority: { name: "Priority", type: "select" },
	effort: { name: "Effort", type: "select" },
	startDate: { name: "Start date", type: "date" },
	targetDate: { name: "Target date", type: "date" },
};

/**
 * Writes the {@link IssueFields} of an issue, and clears and unblocks as `clear` and `unblock` ask. `issue` is the issue
 * as it is now (its numeric id and Type); `isNew` says it was just made, so nothing is read to compare.
 */
export async function applyIssueFields(
	ctx: FieldContext,
	issue: GitHubIssue,
	input: IssueFields & { clear?: IssueClearable[]; unblock?: string[] },
	isNew: boolean
): Promise<FieldsOutcome> {
	const { client, repo } = ctx;
	const fields = (ctx.fields ??= createFieldSetter(client, repo));
	const out: FieldsOutcome = { changed: [], dropped: [] };
	const flags = { isNew };
	const clear = new Set(input.clear ?? []);

	if (input.kind) {
		const name = KIND_NAMES[input.kind];
		if (issue.type?.name?.toLowerCase() !== name.toLowerCase()) {
			await guarded(`kind ${name}`, out, async () => {
				await client.issues.updateIssue(repo, issue.number, { type: name });
				out.changed.push(`kind: ${name}`);
			});
		}
	} else if (clear.has("kind") && issue.type) {
		await guarded("kind", out, async () => {
			await client.issues.updateIssue(repo, issue.number, { type: null });
			out.changed.push("kind cleared");
		});
	}

	const values: Array<[string, string, "select" | "date", string | undefined]> = [
		[
			"priority",
			"Priority",
			"select",
			input.priority && input.priority !== "none" ? PRIORITY_OPTION_NAMES[input.priority] : undefined,
		],
		["effort", "Effort", "select", input.effort ? EFFORT_NAMES[input.effort] : undefined],
		["startDate", "Start date", "date", input.startDate],
		["targetDate", "Target date", "date", input.targetDate],
	];
	for (const [label, name, type, value] of values) {
		if (!value) continue;
		const result = await fields.set(issue.number, { name, type, value }, flags);
		if (result.note) out.dropped.push(result.note);
		else if (result.changed) out.changed.push(`${label}: ${value}`);
	}
	for (const key of clear) {
		const target = CLEAR_FIELD[key];
		if (!target) continue;
		const result = await fields.clear(issue.number, target, flags);
		if (result.note) out.dropped.push(result.note);
		else if (result.changed) out.changed.push(`${key} cleared`);
	}

	if (input.parent) {
		const parentKey = input.parent;
		await guarded(`parent ${parentKey}`, out, async () => {
			const parentNumber = ctx.parseKey(parentKey);
			const current = isNew ? null : await client.issues.getParent(repo, issue.number);
			if (current?.number === parentNumber) return;
			await client.issues.addSubIssue(repo, parentNumber, issue.id, current !== null);
			out.changed.push(`parent: ${parentKey}`);
		});
	} else if (clear.has("parent") && !isNew) {
		await guarded("parent", out, async () => {
			const current = await client.issues.getParent(repo, issue.number);
			if (!current) return;
			await client.issues.removeSubIssue(repo, current.number, issue.id);
			out.changed.push("parent cleared");
		});
	}

	const adds = input.blockedBy ?? [];
	const removes = input.unblock ?? [];
	if (adds.length > 0 || removes.length > 0) {
		let blockers: GitHubIssue[] | undefined;
		const current = async () => (blockers ??= isNew ? [] : await client.issues.listBlockedBy(repo, issue.number));
		for (const key of adds) {
			await guarded(`blocked by ${key}`, out, async () => {
				const number = ctx.parseKey(key);
				if ((await current()).some((b) => b.number === number)) return;
				const blocker = await client.issues.getIssue(repo, number);
				await client.issues.addBlockedBy(repo, issue.number, blocker.id);
				out.changed.push(`blocked by: ${key}`);
			});
		}
		for (const key of removes) {
			await guarded(`unblock ${key}`, out, async () => {
				const number = ctx.parseKey(key);
				const blocker = (await current()).find((b) => b.number === number);
				if (!blocker) return;
				await client.issues.removeBlockedBy(repo, issue.number, blocker.id);
				out.changed.push(`unblocked: ${key}`);
			});
		}
	}
	return out;
}

/** What `GitHubIssues.update` needs beyond the field context. */
export interface UpdateContext extends FieldContext {
	/** The login of the token's user, for `me`. */
	myLogin: () => Promise<string>;
	/** A milestone's number from its number or exact title. */
	resolveMilestone: (ref: string) => Promise<number>;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Changes an issue to match the patch; whatever is already as asked is not written. */
export async function updateGitHubIssue(
	ctx: UpdateContext,
	key: string,
	patch: IssuePatch
): Promise<IssueUpdateResult> {
	const { client, repo } = ctx;
	const number = ctx.parseKey(key);
	const issue = await client.issues.getIssue(repo, number);
	const changed: string[] = [];
	const clear = new Set(patch.clear ?? []);
	const body: Record<string, unknown> = {};

	if (patch.title !== undefined && patch.title !== issue.title) {
		body.title = patch.title;
		changed.push("title");
	}
	if (patch.body !== undefined && patch.body !== (issue.body ?? "")) {
		body.body = patch.body;
		changed.push("body");
	}
	if (patch.state && patch.state !== issue.state) {
		body.state = patch.state;
		if (patch.state === "closed") body.state_reason = patch.stateReason ?? "completed";
		changed.push(`state: ${patch.state}`);
	}
	const have = (issue.assignees ?? (issue.assignee ? [issue.assignee] : [])).map((a) => a.login);
	if (patch.assignees?.length) {
		const isMe = (a: string) => /^@?me$/i.test(a);
		const me = patch.assignees.some(isMe) ? await ctx.myLogin() : undefined;
		const want = [...new Set(patch.assignees.map((a) => (isMe(a) && me ? me : a.replace(/^@/, ""))))];
		if (
			!sameSet(
				want.map((a) => a.toLowerCase()),
				have.map((a) => a.toLowerCase())
			)
		) {
			body.assignees = want;
			changed.push(`assignees: ${want.join(", ")}`);
		}
	} else if (clear.has("assignees") && have.length > 0) {
		body.assignees = [];
		changed.push("assignees cleared");
	}
	if (patch.milestone) {
		const milestone = await ctx.resolveMilestone(patch.milestone);
		if (issue.milestone?.number !== milestone) {
			body.milestone = milestone;
			changed.push(`milestone: ${patch.milestone}`);
		}
	} else if (clear.has("milestone") && issue.milestone) {
		body.milestone = null;
		changed.push("milestone cleared");
	}
	if (Object.keys(body).length > 0) await client.issues.updateIssue(repo, number, body);

	const labels = new Set(issue.labels.map((l) => l.name.toLowerCase()));
	const add = [...new Set(patch.addLabels ?? [])].filter((l) => !labels.has(l.toLowerCase()));
	if (add.length > 0) {
		await client.issues.addLabels(repo, number, add);
		changed.push(`labels added: ${add.join(", ")}`);
	}
	for (const label of new Set(patch.removeLabels ?? [])) {
		if (!labels.has(label.toLowerCase())) continue;
		const exact = issue.labels.find((l) => l.name.toLowerCase() === label.toLowerCase())!.name;
		await client.issues.removeLabel(repo, number, exact);
		changed.push(`label removed: ${exact}`);
	}

	const fields = await applyIssueFields(ctx, issue, patch, false);
	const all = [...changed, ...fields.changed];
	return { key: `#${number}`, changed: all, ...(fields.dropped.length > 0 ? { dropped: fields.dropped } : {}) };
}
