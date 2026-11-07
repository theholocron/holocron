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

import type { ImportOptions, ImportResult, IssueRecord, IssueSelector } from "@theholocron/cli";
import type { LinearIssue, LinearProject } from "@theholocron/linear-client";

import { fromLinearPriority, isClosed, normalizeKey, pickState, statusCategory, toLinearPriority } from "./mapping.js";
import type { TeamScope } from "./team-scope.js";

/** Reads the issues `selector` names, with their comments, priority, labels, parent and blockers. */
export async function exportIssues(scope: TeamScope, selector: IssueSelector): Promise<IssueRecord[]> {
	const { client } = scope;
	const team = await scope.team();
	let raw: LinearIssue[];
	if (selector.keys) {
		raw = await Promise.all(selector.keys.map((k) => client.issues.get(normalizeKey(k, scope.teamKey))));
	} else if (selector.milestone) {
		const project = await findProject(scope, selector.milestone);
		if (!project) throw new Error(`Project "${selector.milestone}" not found in Linear.`);
		raw = await client.issues.list({ projectId: project.id });
	} else if (selector.all) {
		raw = await client.issues.list({ teamId: team.id });
	} else {
		throw new Error("export needs keys, a milestone or all");
	}

	const records: IssueRecord[] = [];
	for (const issue of raw) {
		const closed = isClosed(issue.state.type);
		if (selector.openOnly && closed) continue;
		const comments = await client.issues.comments(issue.id);
		const priority = fromLinearPriority(issue.priority);
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
		});
	}
	return records;
}

/** Makes the records as issues in the team, then sets the parent and blocked-by links among them. */
export async function importIssues(
	scope: TeamScope,
	records: IssueRecord[],
	options: ImportOptions = {}
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

	const projectId = async (name: string): Promise<string | undefined> => {
		const key = name.toLowerCase();
		if (!projects.has(key)) {
			const found = await findProject(scope, name);
			if (found) projects.set(key, found.id);
			else if (!options.dryRun) {
				projects.set(key, (await client.projects.create({ name, teamIds: [team.id] })).id);
			}
		}
		return projects.get(key);
	};

	const made = new Map<string, { id: string; created: boolean }>();
	const results: ImportResult[] = [];

	for (const record of records) {
		const existing = (await client.issues.attachmentsForUrl(record.url)).find((a) =>
			a.issue.identifier.startsWith(`${team.key}-`)
		);
		if (existing) {
			made.set(record.key, { id: existing.issue.id, created: false });
			results.push({ source: record.key, key: existing.issue.identifier, created: false, dropped: [] });
			continue;
		}

		const dropped: string[] = [];
		const assigneeId = record.assignee?.emailAddress
			? userIds.get(record.assignee.emailAddress.toLowerCase())
			: undefined;
		if (record.assignee && !assigneeId) dropped.push("assignee (no Linear user with that email)");
		if (record.comments.some((c) => c.author)) dropped.push("comment authors (named in the text)");
		if (options.dryRun) {
			results.push({ source: record.key, created: true, dropped });
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
		await client.issues.attach(issue.id, record.url, `Migrated from ${record.key}`);
		for (const comment of record.comments) {
			const body = comment.author ? `**${comment.author}** wrote:\n\n${comment.body}` : comment.body;
			await client.issues.comment(issue.id, body, comment.createdAt);
		}
		made.set(record.key, { id: issue.id, created: true });
		results.push({ source: record.key, key: issue.identifier, created: true, dropped });
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

async function findProject(scope: TeamScope, ref: string): Promise<LinearProject | undefined> {
	const team = await scope.team();
	const all = await scope.client.projects.list();
	return all.find(
		(p) =>
			!p.archivedAt &&
			p.teams.nodes.some((t) => t.id === team.id) &&
			(p.id === ref || p.name.toLowerCase() === ref.toLowerCase())
	);
}
