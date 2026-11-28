import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** An issue as GitHub returns it, with only the fields this client reads. */
export interface GitHubIssue {
	/** The issue's numeric id. */
	id: number;
	/** The issue's number within its repository. */
	number: number;
	/** The issue's title. */
	title: string;
	/** The issue's description; `null` or absent when empty. */
	body?: string | null;
	/** Whether the issue is open or closed. */
	state: "open" | "closed";
	/** The labels on the issue. */
	labels: Array<{ name: string }>;
	/** The user the issue is assigned to, or `null` when unassigned. */
	assignee: {
		login: string;
		name?: string | null;
		email?: string | null;
	} | null;
	/** Everyone the issue is assigned to; absent where the response does not list them. */
	assignees?: Array<{ login: string }>;
	/** When the issue was last updated, as an ISO 8601 timestamp. */
	updated_at: string;
	/** The URL of the issue's page on GitHub. */
	html_url: string;
	/** When the issue was created, as an ISO 8601 timestamp. */
	created_at?: string;
	/** The milestone the issue belongs to, or `null` when none. */
	milestone?: { number: number; title: string } | null;
	/** The issue's GraphQL node id. */
	node_id?: string;
	/** The issue's Type (Bug, Feature, Task), or `null` when it has none; absent where the organization has no types. */
	type?: { name: string } | null;
	/** Set when the item is a pull request; GitHub's issues API returns pull requests too. */
	pull_request?: unknown;
}

/** A milestone, with only the fields this client reads. */
export interface GitHubMilestone {
	/** The milestone's number. */
	number: number;
	/** The milestone's title. */
	title: string;
}

/** A comment on an issue, with only the fields this client reads. */
export interface GitHubIssueComment {
	/** The comment's text. */
	body: string;
	/** When it was written, as an ISO 8601 timestamp. */
	created_at: string;
	/** Who wrote it. */
	user: { login: string } | null;
}

/** Filters for listing issues. */
export interface IssueSearchParams {
	/** The page to read, from 1. */
	page?: number;
	/** A milestone number, `*` for any or `none`. */
	milestone?: string;
	/** Which issues to list by state; GitHub defaults to `open`. */
	state?: "open" | "closed" | "all";
	/** The field to sort by, passed through to GitHub. */
	sort?: string;
	/** The sort direction, passed through to GitHub. */
	direction?: string;
	/** The number of issues per page. */
	per_page?: number;
	/** Which issues to list by relation to the user, passed through to GitHub. */
	filter?: string;
	/** Limit to issues assigned to this login. */
	assignee?: string;
}

export function issues(rest: RestClient) {
	return {
		listIssues: (repo: string, params: IssueSearchParams = {}): Promise<GitHubIssue[]> => {
			const qs = new URLSearchParams();
			if (params.state) qs.set("state", params.state);
			if (params.sort) qs.set("sort", params.sort);
			if (params.direction) qs.set("direction", params.direction);
			if (params.per_page) qs.set("per_page", String(params.per_page));
			if (params.filter) qs.set("filter", params.filter);
			if (params.assignee) qs.set("assignee", params.assignee);
			if (params.page) qs.set("page", String(params.page));
			if (params.milestone) qs.set("milestone", params.milestone);
			const q = qs.toString();
			const path = q ? `${repoBase(repo)}/issues?${q}` : `${repoBase(repo)}/issues`;
			return rest.request<GitHubIssue[]>(path);
		},

		getIssue: (repo: string, number: number): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}`),

		createIssue: (repo: string, body: Record<string, unknown>): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues`, {
				method: "POST",
				body,
			}),

		updateIssue: (repo: string, number: number, body: Record<string, unknown>): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}`, {
				method: "PATCH",
				body,
			}),

		/** Makes `subIssueId` (an issue's numeric `id`, not its number) a sub-issue of the issue `number`; `replaceParent` moves it from another parent. */
		addSubIssue: (repo: string, number: number, subIssueId: number, replaceParent = false): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}/sub_issues`, {
				method: "POST",
				body: { sub_issue_id: subIssueId, ...(replaceParent ? { replace_parent: true } : {}) },
			}),

		/** Takes `subIssueId` (an issue's numeric `id`) off the issue `number`, its parent. */
		removeSubIssue: (repo: string, number: number, subIssueId: number): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}/sub_issue`, {
				method: "DELETE",
				body: { sub_issue_id: subIssueId },
			}),

		/** The parent of the issue `number`, or `null` when it has none (GitHub answers 404). */
		getParent: async (repo: string, number: number): Promise<GitHubIssue | null> => {
			try {
				return await rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}/parent`);
			} catch (err) {
				if ((err as { status?: number }).status === 404) return null;
				throw err;
			}
		},

		/** The issues that block the issue `number`. */
		listBlockedBy: (repo: string, number: number): Promise<GitHubIssue[]> =>
			rest.request<GitHubIssue[]>(`${repoBase(repo)}/issues/${number}/dependencies/blocked_by?per_page=100`),

		/** Records that `blockerId` (an issue's numeric `id`) blocks the issue `number`. */
		addBlockedBy: (repo: string, number: number, blockerId: number): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}/dependencies/blocked_by`, {
				method: "POST",
				body: { issue_id: blockerId },
			}),

		/** Removes the record that `blockerId` (an issue's numeric `id`) blocks the issue `number`. */
		removeBlockedBy: (repo: string, number: number, blockerId: number): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}/dependencies/blocked_by/${blockerId}`, {
				method: "DELETE",
			}),

		addLabels: (repo: string, number: number, labels: string[]): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/labels`, {
				method: "POST",
				body: { labels },
			}),

		removeLabel: (repo: string, number: number, label: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/labels/${encodeURIComponent(label)}`, {
				method: "DELETE",
			}),

		createComment: (repo: string, number: number, body: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/comments`, {
				method: "POST",
				body: { body },
			}),

		listComments: async (repo: string, number: number): Promise<GitHubIssueComment[]> => {
			const all: GitHubIssueComment[] = [];
			for (let page = 1; ; page++) {
				const batch = await rest.request<GitHubIssueComment[]>(
					`${repoBase(repo)}/issues/${number}/comments?per_page=100&page=${page}`
				);
				all.push(...batch);
				if (batch.length < 100) return all;
			}
		},

		createMilestone: (repo: string, title: string): Promise<GitHubMilestone> =>
			rest.request<GitHubMilestone>(`${repoBase(repo)}/milestones`, { method: "POST", body: { title } }),

		listMilestones: (
			repo: string,
			params: { state?: "open" | "closed" | "all" } = {}
		): Promise<GitHubMilestone[]> => {
			const qs = new URLSearchParams({ per_page: "100" });
			if (params.state) qs.set("state", params.state);
			return rest.request<GitHubMilestone[]>(`${repoBase(repo)}/milestones?${qs.toString()}`);
		},
	};
}
