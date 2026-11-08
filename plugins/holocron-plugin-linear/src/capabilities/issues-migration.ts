/**
 * Export and import of Linear issues for `holocron migrate`.
 *
 * Linear holds more than GitHub (priority, estimates, relations, backdating), so a move into it loses little; a move
 * back out loses what GitHub cannot hold, and that is `GitHubIssues.import`'s `dropped` list. What this side cannot
 * keep is named in each result's `dropped`:
 *  - an assignee is matched by email; no match, no assignee;
 *  - a comment is posted by the token's user, so its author is named in the text;
 *  - a link to an issue outside the migrated set cannot be made (the target has no key for it).
 * Each imported issue gets an attachment pointing at the source address, which is how a second run finds it.
 * Fields Linear has and the neutral record does not (estimate, due date, cycle) are not exported.
 */

import {
	type ExportInfo,
	type ImportOptions,
	type ImportResult,
	type IssueRecord,
	type IssueSelector,
	pickByCreation,
	readKeysLimited,
	reportProgress,
} from "@theholocron/cli";
import type { LinearIssue, LinearProject } from "@theholocron/linear-client";

import { fromLinearPriority, isClosed, normalizeKey, pickState, statusCategory, toLinearPriority } from "./mapping.js";
import type { TeamScope } from "./team-scope.js";

/** The start of the title of the attachment that records where an issue was migrated from. */
export const MIGRATED_TITLE_PREFIX = "Migrated from ";

/** The text a comment gets when it is copied: Linear posts as the token's user, so the author is named in the text. */
export function renderComment(comment: { author?: string; body: string }): string {
	return comment.author ? `**${comment.author}** wrote:\n\n${comment.body}` : comment.body;
}

/** The Linear user a record's assignee is, matched by email; undefined when there is none or no match. */
export function assigneeFor(record: IssueRecord, userIds: Map<string, string>): string | undefined {
	return record.assignee?.emailAddress ? userIds.get(record.assignee.emailAddress.toLowerCase()) : undefined;
}

/** What Linear cannot carry of this record, for the report. */
export function droppedFor(record: IssueRecord, assigneeId: string | undefined): string[] {
	const dropped: string[] = [];
	if (record.assignee && !assigneeId) dropped.push("assignee (no Linear user with that email)");
	if (record.comments.some((c) => c.author)) dropped.push("comment authors (named in the text)");
	return dropped;
}

/** How many issues a limited export fetches at once when it reads an explicit list of keys. */
const EXPORT_CONCURRENCY = 4;

/**
 * Reads the issues `selector` names, with their comments, priority, labels, parent and blockers.
 *
 * With `limit`, only that many survivors of the other filters are read, from the `order` end of the creation order. A
 * list of keys is sorted by issue number (which rises with creation in one team) before anything is fetched, then
 * fetched a few at a time until enough are kept; a listing already carries `createdAt`, so it is sorted on that and cut
 * before the per-issue comment requests. `info.matched` receives how many the selection matched before the cut.
 */
export async function exportIssues(
	scope: TeamScope,
	selector: IssueSelector,
	info: ExportInfo = {}
): Promise<IssueRecord[]> {
	const { client } = scope;
	const team = await scope.team();
	const since = selector.since ? Date.parse(selector.since) : undefined;
	const survives = (issue: LinearIssue): boolean =>
		!(selector.openOnly && isClosed(issue.state.type)) &&
		(since === undefined || Date.parse(issue.updatedAt) >= since);
	const { limit, order = "oldest" } = selector;

	let issues: LinearIssue[];
	if (selector.keys) {
		const fetch = (k: string) => client.issues.get(normalizeKey(k, scope.teamKey));
		info.matched = selector.keys.length;
		issues =
			limit === undefined
				? (await Promise.all(selector.keys.map(fetch))).filter(survives)
				: await readKeysLimited({
						keys: selector.keys,
						order,
						limit,
						concurrency: EXPORT_CONCURRENCY,
						fetch,
						keep: survives,
					});
	} else {
		let raw: LinearIssue[];
		if (selector.milestone) {
			const project = await findProject(scope, selector.milestone);
			if (!project) throw new Error(`Project "${selector.milestone}" not found in Linear.`);
			raw = await client.issues.list({ projectId: project.id });
		} else if (selector.all) {
			raw = await client.issues.list({ teamId: team.id });
		} else {
			throw new Error("export needs keys, a milestone or all");
		}
		issues = raw.filter(survives);
		info.matched = issues.length;
		if (limit !== undefined) issues = pickByCreation(issues, (i) => i.createdAt, order, limit);
	}

	const records: IssueRecord[] = [];
	for (const issue of issues) {
		reportProgress(info.onProgress, records.length, issues.length);
		const closed = isClosed(issue.state.type);
		const comments = await client.issues.comments(issue.id);
		const priority = fromLinearPriority(issue.priority);
		const migratedFrom = issue.attachments?.nodes.find((a) => a.title.startsWith(MIGRATED_TITLE_PREFIX))?.url;
		records.push({
			key: issue.identifier,
			url: issue.url,
			title: issue.title,
			...(issue.description ? { body: issue.description } : {}),
			status: issue.state.name,
			statusCategory: statusCategory(issue.state),
			closed,
			...(priority ? { priority } : {}),
			labels: issue.labels.nodes.map((l) => l.name),
			...(issue.assignee
				? {
						assignee: {
							id: issue.assignee.id,
							displayName: issue.assignee.displayName || issue.assignee.name,
							...(issue.assignee.email ? { emailAddress: issue.assignee.email } : {}),
						},
					}
				: {}),
			...(issue.project ? { milestone: issue.project.name } : {}),
			...(issue.parent ? { parent: issue.parent.identifier } : {}),
			blockedBy: issue.inverseRelations.nodes.filter((r) => r.type === "blocks").map((r) => r.issue.identifier),
			comments: comments.map((c) => ({
				...(c.user ? { author: c.user.displayName || c.user.name } : {}),
				body: c.body,
				createdAt: c.createdAt,
			})),
			createdAt: issue.createdAt,
			updatedAt: issue.updatedAt,
			...(migratedFrom ? { migratedFrom } : {}),
		});
	}
	reportProgress(info.onProgress, records.length, issues.length);
	return records;
}

/** Makes the records as issues in the team, then sets the parent and blocked-by links among them. `results` receives each record as it is done, so a caller that stops the run on an error still has the finished ones. */
export async function importIssues(
	scope: TeamScope,
	records: IssueRecord[],
	options: ImportOptions = {},
	results: ImportResult[] = []
): Promise<ImportResult[]> {
	const { client } = scope;
	const team = await scope.team();
	const [states, labels, users] = await Promise.all([
		client.teams.states(team.id),
		client.teams.labels(team.id),
		client.teams.users(),
	]);
	const labelIds = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]));
	const userIds = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]));
	const projects = new Map<string, string>();

	// Only reached on a real run (a dry run returns before it), so a missing project is made here.
	const projectId = async (name: string): Promise<string> => {
		const key = name.toLowerCase();
		if (!projects.has(key)) {
			const found = await findProject(scope, name);
			projects.set(key, found?.id ?? (await client.projects.create({ name, teamIds: [team.id] })).id);
		}
		return projects.get(key)!;
	};

	const made = new Map<string, { id: string; created: boolean }>();
	const tick = () => reportProgress(options.onProgress, results.length, records.length);

	for (const record of records) {
		const existing = (await client.issues.attachmentsForUrl(record.url)).find((a) =>
			a.issue.identifier.startsWith(`${team.key}-`)
		);
		if (existing) {
			made.set(record.key, { id: existing.issue.id, created: false });
			results.push({ source: record.key, key: existing.issue.identifier, created: false, dropped: [] });
			tick();
			continue;
		}

		const assigneeId = assigneeFor(record, userIds);
		const dropped = droppedFor(record, assigneeId);
		if (options.dryRun) {
			results.push({ source: record.key, created: true, dropped });
			tick();
			continue;
		}

		const state = pickState(states, {
			...(record.status ? { name: record.status } : {}),
			category: record.statusCategory,
			closed: record.closed,
		});
		const ids: string[] = [];
		for (const name of record.labels) {
			let id = labelIds.get(name.toLowerCase());
			if (!id) {
				id = (await client.teams.createLabel({ name, teamId: team.id })).id;
				labelIds.set(name.toLowerCase(), id);
			}
			ids.push(id);
		}
		const milestone = options.milestone ?? record.milestone;
		const project = milestone ? await projectId(milestone) : undefined;

		const issue = await client.issues.create({
			teamId: team.id,
			title: record.title,
			...(record.body ? { description: record.body } : {}),
			priority: toLinearPriority(record.priority),
			...(state ? { stateId: state.id } : {}),
			...(assigneeId ? { assigneeId } : {}),
			...(ids.length > 0 ? { labelIds: ids } : {}),
			...(project ? { projectId: project } : {}),
			createdAt: record.createdAt,
		});
		await client.issues.attach(issue.id, record.url, `${MIGRATED_TITLE_PREFIX}${record.key}`);
		for (const comment of record.comments) {
			await client.issues.comment(issue.id, renderComment(comment), comment.createdAt);
		}
		made.set(record.key, { id: issue.id, created: true });
		results.push({ source: record.key, key: issue.identifier, created: true, dropped });
		tick();
	}

	if (!options.dryRun) await linkIssues(scope, records, made, results);
	return results;
}

/** Second pass: parent and blocked-by links among the issues this run made. */
async function linkIssues(
	scope: TeamScope,
	records: IssueRecord[],
	made: Map<string, { id: string; created: boolean }>,
	results: ImportResult[]
): Promise<void> {
	for (const record of records) {
		const self = made.get(record.key);
		const result = results.find((r) => r.source === record.key);
		if (!self?.created || !result) continue;
		if (record.parent) {
			const parent = made.get(record.parent);
			if (parent) await scope.client.issues.update(self.id, { parentId: parent.id });
			else result.dropped.push(`parent ${record.parent} (not in this migration)`);
		}
		for (const blocker of record.blockedBy) {
			const other = made.get(blocker);
			if (other) await scope.client.issues.relate(other.id, self.id, "blocks");
			else result.dropped.push(`blockedBy ${blocker} (not in this migration)`);
		}
	}
}

export async function findProject(scope: TeamScope, ref: string): Promise<LinearProject | undefined> {
	const team = await scope.team();
	const all = await scope.client.projects.list();
	return all.find(
		(p) =>
			!p.archivedAt &&
			p.teams.nodes.some((t) => t.id === team.id) &&
			(p.id === ref || p.name.toLowerCase() === ref.toLowerCase())
	);
}
