/**
 * Export and import of GitHub issues for `holocron migrate`.
 *
 * GitHub holds less than a planning tool, so what does not fit is named in each result's `dropped` list rather than
 * lost quietly:
 *  - priority is a label (`priority: high`), because on GitHub it lives in a project field, not on the issue;
 *  - an import cannot backdate an issue or a comment, and cannot post as someone else, so the original date and
 *    author go in the text;
 *  - an import does not set parent or blocked-by links (they need GraphQL node ids of issues made in the same run);
 *  - an assignee is not mapped (a Linear user is not a GitHub login).
 * A migrated issue ends with `<!-- holocron:migrated-from <url> -->`, which is how a second run finds it.
 */

import {
	type ImportOptions,
	type ImportResult,
	type IssueComment,
	type IssuePriority,
	type IssueRecord,
	type IssueSelector,
	ProviderApiError,
	type StatusCategory,
} from "@theholocron/cli";
import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";

export const MARKER = /<!-- holocron:migrated-from (\S+) -->/;
const PRIORITY_LABEL = /^priority\s*[:/-]\s*(urgent|high|medium|low)$/i;

interface Link {
	repository: {
		issue: { parent: { number: number } | null; blockedBy: { nodes: Array<{ number: number }> } } | null;
	};
}

const LINK_QUERY = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) {
	issue(number: $number) { parent { number } blockedBy(first: 50) { nodes { number } } } } }`;

/** Splits `priority: high` labels from the rest. */
function splitLabels(names: string[]): { labels: string[]; priority?: IssuePriority } {
	let priority: IssuePriority | undefined;
	const labels: string[] = [];
	for (const name of names) {
		const match = PRIORITY_LABEL.exec(name);
		if (match) priority = match[1]!.toLowerCase() as IssuePriority;
		else labels.push(name);
	}
	return { labels, ...(priority ? { priority } : {}) };
}

function categoryOf(issue: GitHubIssue): StatusCategory {
	if (issue.state === "closed") return "done";
	const names = issue.labels.map((l) => l.name.toLowerCase());
	if (names.some((n) => n === "status:in-review" || n === "status: in review")) return "in-review";
	if (names.some((n) => n === "status:in-progress" || n === "status: in progress")) return "in-progress";
	return "open";
}

/** How many issues an export fetches at once. GitHub's secondary rate limit punishes bursts of requests, not volume. */
const EXPORT_CONCURRENCY = 4;

/** Runs `fn` over `items`, at most `limit` at a time, and returns the results in the order of `items`. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array<R>(items.length);
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < items.length) {
			const at = next++;
			results[at] = await fn(items[at] as T);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

/** GitHub's own answer to a burst of requests (403 or 429 naming the secondary limit) becomes a message that says what to do. */
function explainSecondaryLimit(err: unknown): unknown {
	if (
		err instanceof ProviderApiError &&
		(err.status === 403 || err.status === 429) &&
		String(err.details).includes("secondary rate limit")
	) {
		return new Error(
			"GitHub's secondary rate limit stopped the export. It limits bursts of requests, not the hourly quota, and nothing has been written. Wait a couple of minutes and run the command again."
		);
	}
	return err;
}

/** Reads the issues `selector` names, with their comments, priority label, parent and blockers. */
export async function exportIssues(
	client: GitHubClient,
	repo: string,
	selector: IssueSelector
): Promise<IssueRecord[]> {
	return readIssues(client, repo, selector).catch((err: unknown) => {
		throw explainSecondaryLimit(err);
	});
}

async function readIssues(client: GitHubClient, repo: string, selector: IssueSelector): Promise<IssueRecord[]> {
	const [owner = "", name = ""] = repo.split("/", 2);
	let raw: GitHubIssue[];
	if (selector.keys) {
		raw = await mapLimit(selector.keys, EXPORT_CONCURRENCY, (k) => client.issues.getIssue(repo, parseNumber(k)));
	} else if (selector.milestone) {
		const milestone = await findMilestone(client, repo, selector.milestone);
		if (!milestone) throw new Error(`Milestone "${selector.milestone}" not found in ${repo}.`);
		raw = await listAll(client, repo, { milestone: String(milestone.number) });
	} else if (selector.all) {
		raw = await listAll(client, repo, {});
	} else {
		throw new Error("export needs keys, a milestone or all");
	}
	const since = selector.since ? Date.parse(selector.since) : undefined;
	const issues = raw.filter(
		(i) =>
			!i.pull_request &&
			!(selector.openOnly && i.state === "closed") &&
			(since === undefined || Date.parse(i.updated_at) >= since)
	);

	const records: IssueRecord[] = [];
	for (const issue of issues) {
		const comments = await client.issues.listComments(repo, issue.number);
		const link = await client.graphql
			.query<Link>(LINK_QUERY, { owner, name, number: issue.number })
			.catch(() => undefined);
		const links = link?.repository.issue;
		const { labels, priority } = splitLabels(issue.labels.map((l) => l.name));
		const body = issue.body?.replace(MARKER, "").trimEnd();
		const migratedFrom = issue.body ? MARKER.exec(issue.body)?.[1] : undefined;
		records.push({
			key: `#${issue.number}`,
			url: issue.html_url,
			title: issue.title,
			...(body ? { body } : {}),
			statusCategory: categoryOf(issue),
			closed: issue.state === "closed",
			...(priority ? { priority } : {}),
			labels: labels.filter((l) => !l.toLowerCase().startsWith("status:")),
			...(issue.assignee
				? {
						assignee: {
							id: issue.assignee.login,
							displayName: issue.assignee.name ?? issue.assignee.login,
							...(issue.assignee.email ? { emailAddress: issue.assignee.email } : {}),
						},
					}
				: {}),
			...(issue.milestone ? { milestone: issue.milestone.title } : {}),
			...(links?.parent ? { parent: `#${links.parent.number}` } : {}),
			blockedBy: (links?.blockedBy.nodes ?? []).map((n) => `#${n.number}`),
			comments: comments.map((c): IssueComment => ({
				...(c.user ? { author: c.user.login } : {}),
				body: c.body,
				createdAt: c.created_at,
			})),
			createdAt: issue.created_at ?? issue.updated_at,
			updatedAt: issue.updated_at,
			...(migratedFrom ? { migratedFrom } : {}),
		});
	}
	return records;
}

/** Makes the records as issues, skipping any whose source address an earlier run already recorded. */
export async function importIssues(
	client: GitHubClient,
	repo: string,
	records: IssueRecord[],
	options: ImportOptions = {}
): Promise<ImportResult[]> {
	const existing = new Map<string, number>();
	for (const issue of await listAll(client, repo, {})) {
		const url = issue.body ? MARKER.exec(issue.body)?.[1] : undefined;
		if (url) existing.set(url, issue.number);
	}

	const results: ImportResult[] = [];
	for (const record of records) {
		const found = existing.get(record.url);
		if (found !== undefined) {
			results.push({ source: record.key, key: `#${found}`, created: false, dropped: [] });
			continue;
		}
		const dropped = droppedFor(record);
		if (options.dryRun) {
			results.push({ source: record.key, created: true, dropped });
			continue;
		}
		const number = await createFromRecord(client, repo, record, options);
		results.push({ source: record.key, key: `#${number}`, created: true, dropped });
	}
	return results;
}

/** What GitHub cannot hold of this record, for the report. */
export function droppedFor(record: IssueRecord): string[] {
	const dropped = ["createdAt (GitHub sets it; the original date is in the text)"];
	if (record.assignee) dropped.push("assignee (not mapped)");
	if (record.parent) dropped.push("parent (not set on GitHub)");
	if (record.blockedBy.length > 0) dropped.push("blockedBy (not set on GitHub)");
	return dropped;
}

/** The labels a record becomes on GitHub: its own, plus `priority: <level>` (GitHub's priority is a label). */
export function labelsFor(record: IssueRecord): string[] {
	return [
		...record.labels,
		...(record.priority && record.priority !== "none" ? [`priority: ${record.priority}`] : []),
	];
}

/** The text a comment gets when it is copied: GitHub cannot post as another author or backdate. */
export function renderComment(comment: IssueComment): string {
	const who = comment.author ? `**${comment.author}**` : "Someone";
	return `${who} commented on ${comment.createdAt}:\n\n${comment.body}`;
}

/** Makes one issue from a record, with its comments, and closes it when the record is closed; returns its number. */
export async function createFromRecord(
	client: GitHubClient,
	repo: string,
	record: IssueRecord,
	options: ImportOptions
): Promise<number> {
	const milestoneName = options.milestone ?? record.milestone;
	const milestone = milestoneName ? await ensureMilestone(client, repo, milestoneName) : undefined;
	const labels = labelsFor(record);
	const created = await client.issues.createIssue(repo, {
		title: record.title,
		body: withProvenance(record),
		...(labels.length > 0 ? { labels } : {}),
		...(milestone !== undefined ? { milestone } : {}),
	});
	for (const comment of record.comments) {
		await client.issues.createComment(repo, created.number, renderComment(comment));
	}
	if (record.closed) {
		await client.issues.updateIssue(repo, created.number, { state: "closed", state_reason: "completed" });
	}
	return created.number;
}

/** The text of a migrated issue: the record's body, then where it came from and the marker a second run looks for. */
export function withProvenance(record: IssueRecord): string {
	const body = record.body ? `${record.body}\n\n` : "";
	return (
		`${body}---\n_Migrated from [${record.key}](${record.url}); created ${record.createdAt}._\n` +
		`<!-- holocron:migrated-from ${record.url} -->`
	);
}

function parseNumber(key: string): number {
	const n = key.trim().replace(/^.*#/, "");
	if (!/^\d+$/.test(n)) throw new Error(`Invalid GitHub issue key "${key}" — expected #N or N.`);
	return parseInt(n, 10);
}

export async function listAll(
	client: GitHubClient,
	repo: string,
	extra: { milestone?: string }
): Promise<GitHubIssue[]> {
	const all: GitHubIssue[] = [];
	for (let page = 1; ; page++) {
		const batch = await client.issues.listIssues(repo, { state: "all", per_page: 100, page, ...extra });
		all.push(...batch);
		if (batch.length < 100) return all;
	}
}

async function findMilestone(client: GitHubClient, repo: string, ref: string) {
	const all = await client.issues.listMilestones(repo, { state: "all" });
	return all.find((m) => String(m.number) === ref || m.title.toLowerCase() === ref.toLowerCase());
}

async function ensureMilestone(client: GitHubClient, repo: string, title: string): Promise<number> {
	return (
		(await findMilestone(client, repo, title))?.number ?? (await client.issues.createMilestone(repo, title)).number
	);
}
