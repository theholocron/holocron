/**
 * Sync of GitHub issues for `holocron sync issues`: `importIssues` that also brings up to date what it made.
 *
 * An issue is one a migration or sync made when its body ends with the `holocron:migrated-from` marker, and only such
 * an issue is changed. Title, description, state and labels (so also the `priority: <level>` label, because GitHub's
 * priority is a label) are set to what the source has when they differ; the labels it does not manage (`status:*`)
 * are kept. An assignee is never mapped (a Linear user is not a GitHub login), so it is reported in `dropped` and not
 * compared. Comments the issue lacks are added, oldest first; none is edited or deleted, and one is found again by the
 * time in its header, so a comment edited on the source is not copied twice.
 */

import type { ImportOptions, IssueRecord, SyncResult } from "@theholocron/cli";
import { ProviderApiError, reportProgress } from "@theholocron/cli";
import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";

import {
	createFromRecord,
	droppedFor,
	labelsFor,
	listAll,
	MARKER,
	renderComment,
	withProvenance,
} from "./issues-migration.js";

const COMMENT_HEADER = /^(?:\*\*.*?\*\*|Someone) commented on (\S+?):\n/;

/** Whether GitHub is asking to be left alone: a 429, or a 403 that says it is a rate limit. */
export function isRateLimited(err: unknown): boolean {
	return (
		err instanceof ProviderApiError &&
		(err.status === 429 || (err.status === 403 && /rate limit/i.test(`${err.message} ${String(err.details)}`)))
	);
}

const normalize = (text: string): string => text.replace(/\r\n/g, "\n").trim();
const sorted = (names: string[]): string =>
	names
		.map((n) => n.toLowerCase())
		.sort()
		.join("\n");

/** Makes the records missing from the repo and updates the ones an earlier run made. See the file comment. */
export async function syncIssues(
	client: GitHubClient,
	repo: string,
	records: IssueRecord[],
	options: ImportOptions = {}
): Promise<SyncResult[]> {
	const existing = new Map<string, GitHubIssue>();
	for (const issue of await listAll(client, repo, {})) {
		const url = issue.body ? MARKER.exec(issue.body)?.[1] : undefined;
		if (url) existing.set(url, issue);
	}

	const results: SyncResult[] = [];
	for (const record of records) {
		try {
			const found = existing.get(record.url);
			results.push(
				found ? await update(client, repo, found, record, options) : await create(client, repo, record, options)
			);
			reportProgress(options.onProgress, results.length, records.length);
		} catch (err) {
			if (isRateLimited(err)) return results;
			throw err;
		}
	}
	return results;
}

async function create(
	client: GitHubClient,
	repo: string,
	record: IssueRecord,
	options: ImportOptions
): Promise<SyncResult> {
	const dropped = droppedFor(record);
	if (options.dryRun) return { source: record.key, created: true, updated: false, changes: [], dropped };
	const number = await createFromRecord(client, repo, record, options);
	return { source: record.key, key: `#${number}`, created: true, updated: false, changes: [], dropped };
}

async function update(
	client: GitHubClient,
	repo: string,
	issue: GitHubIssue,
	record: IssueRecord,
	options: ImportOptions
): Promise<SyncResult> {
	const patch: Record<string, unknown> = {};
	const changes: string[] = [];

	if (issue.title !== record.title) {
		patch.title = record.title;
		changes.push("title");
	}
	const body = withProvenance(record);
	if (normalize(issue.body!) !== normalize(body)) {
		patch.body = body;
		changes.push("description");
	}
	if ((issue.state === "closed") !== record.closed) {
		patch.state = record.closed ? "closed" : "open";
		if (record.closed) patch.state_reason = "completed";
		changes.push("state");
	}
	const current = issue.labels.map((l) => l.name);
	const finalLabels = [...labelsFor(record), ...current.filter((n) => n.toLowerCase().startsWith("status:"))];
	if (sorted(finalLabels) !== sorted(current)) {
		patch.labels = finalLabels;
		changes.push("labels");
	}

	const comments = await client.issues.listComments(repo, issue.number);
	const seen = new Set(comments.map((c) => COMMENT_HEADER.exec(c.body)?.[1]));
	const missing = record.comments.filter((c) => !seen.has(c.createdAt));
	if (missing.length > 0) changes.push("comments");

	if (!options.dryRun) {
		if (Object.keys(patch).length > 0) await client.issues.updateIssue(repo, issue.number, patch);
		for (const comment of missing) await client.issues.createComment(repo, issue.number, renderComment(comment));
	}
	return {
		source: record.key,
		key: `#${issue.number}`,
		created: false,
		updated: changes.length > 0,
		changes,
		dropped: droppedFor(record),
	};
}
