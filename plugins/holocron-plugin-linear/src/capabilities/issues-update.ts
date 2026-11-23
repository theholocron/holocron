/**
 * `Issues.update` for Linear, and the fields `Issues.create` sets after it makes the issue (#2429, spec
 * `tool-work-commands`).
 *
 * What Linear holds: priority (its own scale), a due date (the target date), a parent, `blocks` relations, a project
 * (the milestone) and an estimate. What it does not: an issue Type (the kind is a label: `bug`, `enhancement`, `chore`,
 * the names of the canonical labels), and a start date (the client reads and writes `dueDate` only; whether Linear has
 * none is not verified, so the value is reported as dropped, never invented as a label or a comment). Effort is the
 * estimate on the team's scale (low 1, medium 3, high 5); a team that has estimates off may refuse it, which is a
 * `dropped` line, not a failure (how Linear answers is not verified).
 */

import type { IssueClearable, IssueFields, IssuePatch, IssueUpdateResult } from "@theholocron/cli";
import type { LinearIssue, LinearIssueUpdate } from "@theholocron/linear-client";

import { CORE_KIND_LABELS } from "./issue-kind.js";
import { ESTIMATE } from "./issue-work-fields.js";
import { normalizeKey, pickState, toLinearPriority } from "./mapping.js";
import type { TeamScope } from "./team-scope.js";

/** A person can read why a call failed. */
const why = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs one step; a failure becomes a `dropped` line, because the issue exists (or the rest of the patch is still good). */
async function attempt(what: string, dropped: string[], step: () => Promise<void>): Promise<void> {
	try {
		await step();
	} catch (err) {
		dropped.push(`${what} (${why(err)})`);
	}
}

const sameDate = (a: string | null, b: string) => a !== null && a.slice(0, 10) === b;

/** Sets what Linear can hold of `fields` on `issue`, which was just made, and says what it cannot. */
export async function applyNewIssueFields(
	scope: TeamScope,
	issue: LinearIssue,
	fields: IssueFields
): Promise<string[]> {
	const dropped: string[] = [];
	const { client } = scope;
	if (fields.startDate) dropped.push(`startDate (Linear has no start date): ${fields.startDate}`);
	if (fields.effort) {
		await attempt(`effort ${fields.effort}`, dropped, async () => {
			await client.issues.update(issue.id, { estimate: ESTIMATE[fields.effort!] });
		});
	}
	for (const key of fields.blockedBy ?? []) {
		await attempt(`blocked by ${key}`, dropped, async () => {
			const blocker = await client.issues.get(normalizeKey(key, scope.teamKey));
			await client.issues.relate(blocker.id, issue.id, "blocks");
		});
	}
	return dropped;
}

/** Changes a Linear issue to match the patch; whatever is already as asked is not written. */
export async function updateLinearIssue(
	scope: TeamScope,
	key: string,
	patch: IssuePatch,
	lookups: {
		/** Resolves an assignee to a Linear user id, or says why not. */
		assignee: (who: string) => Promise<{ id: string } | { problem: string }>;
		/** Resolves a label name to its id, making it when the team lacks it. */
		labelIds: (names: string[]) => Promise<string[]>;
		/** Resolves a project by id or name. */
		project: (ref: string) => Promise<string>;
	}
): Promise<IssueUpdateResult> {
	const { client } = scope;
	const issue = await client.issues.get(normalizeKey(key, scope.teamKey));
	const changed: string[] = [];
	const dropped: string[] = [];
	const clear = new Set<IssueClearable>(patch.clear ?? []);
	const input: LinearIssueUpdate = {};

	if (patch.title !== undefined && patch.title !== issue.title) {
		input.title = patch.title;
		changed.push("title");
	}
	if (patch.body !== undefined && patch.body !== (issue.description ?? "")) {
		input.description = patch.body;
		changed.push("body");
	}
	if (patch.priority && patch.priority !== "none" && toLinearPriority(patch.priority) !== issue.priority) {
		input.priority = toLinearPriority(patch.priority);
		changed.push(`priority: ${patch.priority}`);
	} else if (clear.has("priority") && issue.priority !== 0) {
		input.priority = 0;
		changed.push("priority cleared");
	}
	if (patch.targetDate && !sameDate(issue.dueDate, patch.targetDate)) {
		input.dueDate = patch.targetDate;
		changed.push(`targetDate: ${patch.targetDate}`);
	} else if (clear.has("targetDate") && issue.dueDate) {
		input.dueDate = null;
		changed.push("targetDate cleared");
	}
	// An estimate is the one write a team may refuse, so it is written alone, after the rest, and may be dropped.
	let estimate: { value: number | null; said: string } | undefined;
	if (patch.effort && ESTIMATE[patch.effort] !== issue.estimate) {
		estimate = { value: ESTIMATE[patch.effort], said: `effort: ${patch.effort}` };
	} else if (clear.has("effort") && issue.estimate !== null) {
		estimate = { value: null, said: "effort cleared" };
	}
	if (patch.startDate) dropped.push(`startDate (Linear has no start date): ${patch.startDate}`);
	if (clear.has("startDate")) dropped.push("startDate cleared (Linear has no start date)");

	const [wanted, ...extra] = patch.assignees ?? [];
	if (wanted) {
		const found = await lookups.assignee(wanted);
		if ("problem" in found) dropped.push(`assignee (${found.problem}): ${wanted}`);
		else if (found.id !== issue.assignee?.id) {
			input.assigneeId = found.id;
			changed.push(`assignees: ${wanted}`);
		}
		if (extra.length > 0) dropped.push(`assignee (Linear holds one): ${extra.join(", ")}`);
	} else if (clear.has("assignees") && issue.assignee) {
		input.assigneeId = null;
		changed.push("assignees cleared");
	}

	if (patch.milestone) {
		const projectId = await lookups.project(patch.milestone);
		if (projectId !== issue.project?.id) {
			input.projectId = projectId;
			changed.push(`milestone: ${patch.milestone}`);
		}
	} else if (clear.has("milestone") && issue.project) {
		input.projectId = null;
		changed.push("milestone cleared");
	}

	if (patch.parent) {
		const parent = await client.issues.get(normalizeKey(patch.parent, scope.teamKey));
		if (parent.id !== issue.parent?.id) {
			input.parentId = parent.id;
			changed.push(`parent: ${patch.parent}`);
		}
	} else if (clear.has("parent") && issue.parent) {
		input.parentId = null;
		changed.push("parent cleared");
	}

	const kinds = scope.kinds ?? CORE_KIND_LABELS;
	const kindLabel = patch.kind ? kinds.labelOf(patch.kind) : undefined;
	const have = new Map(issue.labels.nodes.map((l) => [l.name.toLowerCase(), l]));
	const add = [...(patch.addLabels ?? []), ...(kindLabel ? [kindLabel] : [])].filter(
		(l) => !have.has(l.toLowerCase())
	);
	const remove = [...(patch.removeLabels ?? []), ...(clear.has("kind") && !patch.kind ? kinds.labels() : [])]
		.map((l) => have.get(l.toLowerCase()))
		.filter((l): l is { id: string; name: string } => l !== undefined);
	if (add.length > 0 || remove.length > 0) {
		const added = add.length > 0 ? await lookups.labelIds([...new Set(add)]) : [];
		const removed = new Set(remove.map((l) => l.id));
		input.labelIds = [
			...new Set([...issue.labels.nodes.map((l) => l.id).filter((id) => !removed.has(id)), ...added]),
		];
		if (add.length > 0) changed.push(`labels added: ${[...new Set(add)].join(", ")}`);
		for (const l of remove) changed.push(`label removed: ${l.name}`);
	}

	if (patch.state) {
		const closed = patch.state === "closed";
		const states = await client.teams.states((await scope.team()).id);
		const target = pickState(states, { category: closed ? "done" : "open" });
		if (!target) dropped.push(`state ${patch.state} (the team has no matching state)`);
		else if (target.id !== issue.state.id) {
			input.stateId = target.id;
			changed.push(`state: ${patch.state}`);
		}
	}

	if (Object.keys(input).length > 0) await client.issues.update(issue.id, input);
	if (estimate) {
		const { value, said } = estimate;
		await attempt(said, dropped, async () => {
			await client.issues.update(issue.id, { estimate: value });
			changed.push(said);
		});
	}

	const blocked = new Set(
		issue.inverseRelations.nodes.filter((r) => r.type === "blocks").map((r) => r.issue.identifier)
	);
	for (const blocker of patch.blockedBy ?? []) {
		await attempt(`blocked by ${blocker}`, dropped, async () => {
			const found = await client.issues.get(normalizeKey(blocker, scope.teamKey));
			if (blocked.has(found.identifier)) return;
			await client.issues.relate(found.id, issue.id, "blocks");
			changed.push(`blocked by: ${blocker}`);
		});
	}
	for (const blocker of patch.unblock ?? []) {
		await attempt(`unblock ${blocker}`, dropped, async () => {
			const identifier = normalizeKey(blocker, scope.teamKey);
			const relation = issue.inverseRelations.nodes.find(
				(r) => r.type === "blocks" && r.issue.identifier === identifier
			);
			if (!relation) return;
			await client.issues.unrelate(relation.id);
			changed.push(`unblocked: ${blocker}`);
		});
	}

	return { key: issue.identifier, changed, ...(dropped.length > 0 ? { dropped } : {}) };
}
