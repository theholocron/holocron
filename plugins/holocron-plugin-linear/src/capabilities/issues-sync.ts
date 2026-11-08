/**
 * Sync of Linear issues for `holocron sync issues`: `importIssues` that also brings up to date what it made.
 *
 * An issue is one a migration or sync made when it has an attachment to the source address, and only such an issue is
 * changed. Records not made yet go through `importIssues`; the others have title, description, priority, state, labels
 * and assignee set to what the source has when they differ, and the comments they lack added, oldest first (a comment
 * is never edited or deleted). Source wins on the fields it holds: a Linear-only label is removed. A state is compared
 * by name when the source has one, else by category, so moving an issue between two "open" states in Linear is not
 * undone. An assignee is matched by email and cleared never: a source with no assignee leaves the Linear one alone.
 */

import type { ImportOptions, ImportResult, IssueRecord, SyncResult } from "@theholocron/cli";
import { ProviderApiError, reportProgress } from "@theholocron/cli";
import type { LinearIssueUpdate } from "@theholocron/linear-client";

import { assigneeFor, droppedFor, importIssues, renderComment } from "./issues-migration.js";
import { pickState, statusCategory, toLinearPriority } from "./mapping.js";
import type { TeamScope } from "./team-scope.js";

/** Whether Linear is asking to be left alone: a 429, or an error that says the rate limit was reached. */
export function isRateLimited(err: unknown): boolean {
	return err instanceof ProviderApiError && (err.status === 429 || /rate ?limit/i.test(err.message));
}

const sorted = (names: string[]): string =>
	names
		.map((n) => n.toLowerCase())
		.sort()
		.join("\n");

/** Makes the records missing from the team and updates the ones an earlier run made. See the file comment. */
export async function syncIssues(
	scope: TeamScope,
	records: IssueRecord[],
	options: ImportOptions = {}
): Promise<SyncResult[]> {
	const { client } = scope;
	const results = new Map<string, SyncResult>();
	const created: ImportResult[] = [];
	const tick = () => reportProgress(options.onProgress, results.size, records.length);
	try {
		const team = await scope.team();
		const existing: Array<{ record: IssueRecord; identifier: string }> = [];
		const missing: IssueRecord[] = [];
		for (const record of records) {
			const attached = (await client.issues.attachmentsForUrl(record.url)).find((a) =>
				a.issue.identifier.startsWith(`${team.key}-`)
			);
			if (attached) existing.push({ record, identifier: attached.issue.identifier });
			else missing.push(record);
		}
		try {
			await importIssues(
				scope,
				missing,
				{ ...options, onProgress: (done) => reportProgress(options.onProgress, done, records.length) },
				created
			);
		} finally {
			for (const r of created) results.set(r.source, { ...r, updated: false, changes: [] });
		}

		if (existing.length > 0) {
			const [states, labels, users] = await Promise.all([
				client.teams.states(team.id),
				client.teams.labels(team.id),
				client.teams.users(),
			]);
			const labelIds = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]));
			const userIds = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]));
			for (const { record, identifier } of existing) {
				const issue = await client.issues.get(identifier);
				const patch: LinearIssueUpdate = {};
				const changes: string[] = [];

				if (issue.title !== record.title) {
					patch.title = record.title;
					changes.push("title");
				}
				if ((issue.description ?? "") !== (record.body ?? "")) {
					patch.description = record.body ?? "";
					changes.push("description");
				}
				if (issue.priority !== toLinearPriority(record.priority)) {
					patch.priority = toLinearPriority(record.priority);
					changes.push("priority");
				}
				const wanted = pickState(states, {
					...(record.status ? { name: record.status } : {}),
					category: record.statusCategory,
					closed: record.closed,
				});
				const named = record.status !== undefined && wanted?.name.toLowerCase() === record.status.toLowerCase();
				const stateDiffers = named
					? wanted!.id !== issue.state.id
					: statusCategory(issue.state) !== record.statusCategory;
				if (wanted && stateDiffers) {
					patch.stateId = wanted.id;
					changes.push("state");
				}
				if (sorted(record.labels) !== sorted(issue.labels.nodes.map((l) => l.name))) {
					changes.push("labels");
					if (!options.dryRun) {
						const ids: string[] = [];
						for (const name of record.labels) {
							let id = labelIds.get(name.toLowerCase());
							if (!id) {
								id = (await client.teams.createLabel({ name, teamId: team.id })).id;
								labelIds.set(name.toLowerCase(), id);
							}
							ids.push(id);
						}
						patch.labelIds = ids;
					}
				}
				const assigneeId = assigneeFor(record, userIds);
				if (assigneeId && issue.assignee?.id !== assigneeId) {
					patch.assigneeId = assigneeId;
					changes.push("assignee");
				}

				const have = await client.issues.comments(issue.id);
				const missingComments = record.comments.filter(
					(c) =>
						!have.some(
							(h) => Date.parse(h.createdAt) === Date.parse(c.createdAt) || h.body === renderComment(c)
						)
				);
				if (missingComments.length > 0) changes.push("comments");

				if (!options.dryRun) {
					if (Object.keys(patch).length > 0) await client.issues.update(issue.id, patch);
					for (const c of missingComments)
						await client.issues.comment(issue.id, renderComment(c), c.createdAt);
				}
				results.set(record.key, {
					source: record.key,
					key: issue.identifier,
					created: false,
					updated: changes.length > 0,
					changes,
					dropped: droppedFor(record, assigneeId),
				});
				tick();
			}
		}
	} catch (err) {
		if (!isRateLimited(err)) throw err;
	}
	return records.filter((r) => results.has(r.key)).map((r) => results.get(r.key)!);
}
