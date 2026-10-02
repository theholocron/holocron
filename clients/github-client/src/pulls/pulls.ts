import type { GraphQLClient, RestClient } from "../utils.js";
import { repoBase, splitRepo } from "../utils.js";

export interface GitHubPullRequest {
	number: number;
	title: string;
	state: "open" | "closed";
	merged_at: string | null;
	html_url: string;
	head: { ref: string };
}

/** A commit's name/email as git itself recorded it — `commit.author`/`commit.committer`, distinct from the GitHub-account `author` below (a commit can carry any email, linked to a GitHub account or not). */
export interface GitHubCommitIdentity {
	name: string;
	email: string;
}

/** One commit as returned by `GET /pulls/{pull_number}/commits` — only the fields any known consumer needs. */
export interface GitHubPullRequestCommit {
	sha: string;
	commit: {
		message: string;
		author: GitHubCommitIdentity;
		committer: GitHubCommitIdentity;
	};
	/** The commit's linked GitHub account, when GitHub can associate one — `null` for a commit email with no linked account. `type: "Bot"` identifies an app-authored commit (e.g. Dependabot, a prior Sentinel auto-fix-commit). */
	author: { login: string; type: "User" | "Bot" } | null;
	/** More than one entry marks a merge commit — it has no authorship of its own beyond its parents', the reason DCO enforcement (and this org's own CI) never requires a signoff on one. */
	parents: Array<{ sha: string }>;
}

/** One file as returned by `GET /pulls/{pull_number}/files` — only the fields any known consumer needs. */
export interface GitHubPullRequestFile {
	filename: string;
	status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
	/** Set only when `status === "renamed"`. */
	previous_filename?: string;
	/**
	 * This file's unified-diff hunks (`@@ -a,b +c,d @@` headers plus
	 * context/added/removed lines) — what a consumer needs to know which
	 * RIGHT-side lines a PR review comment can anchor to. Absent for binary
	 * files and for diffs too large for GitHub to include.
	 */
	patch?: string;
}

/** One inline comment in a `POST /pulls/{pull_number}/reviews` request body. */
export interface CreateReviewComment {
	/** File path relative to the repo root. */
	path: string;
	/** 1-indexed line in the file's current (`RIGHT`) version — GitHub anchors a review comment to a line, not a column. */
	line: number;
	/** Almost always `"RIGHT"` (the PR's own new content) — `"LEFT"` targets the base/pre-PR version instead. */
	side: "LEFT" | "RIGHT";
	body: string;
}

export interface CreateReviewInput {
	/** The PR's head SHA the review attaches to. */
	commit_id: string;
	/** The review's own top-level summary, shown above its inline comments. */
	body: string;
	/**
	 * `"COMMENT"` never blocks a merge by itself — the right choice for an
	 * advisory bot review. `"REQUEST_CHANGES"`/`"APPROVE"` carry the same
	 * real weight as a human reviewer's own review state, affecting
	 * required-approval counts and dismissal.
	 */
	event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
	comments?: CreateReviewComment[];
}

/** `POST /pulls/{pull_number}/reviews`'s response — only the fields any known consumer needs. */
export interface GitHubPullRequestReview {
	id: number;
	html_url: string;
}

/**
 * One review thread — GraphQL-only (`resolveReviewThread`, the mutation
 * this exists to support, has no REST equivalent at all). `id` here is a
 * GraphQL node ID (`PRRT_...`), not the same numeric ID space as REST's
 * review-comment `id` — pass it straight through to `resolveReviewThread()`,
 * never compare it against a REST-sourced ID.
 */
export interface ReviewThread {
	id: string;
	isResolved: boolean;
	/** The thread's first comment's author login (e.g. `"the-holocron-sentinel[bot]"`) — `undefined` if GitHub ever returns a thread with no comments, which shouldn't happen in practice. Callers filter on this before resolving anything, so a bot never touches a human reviewer's own thread. */
	authorLogin: string | undefined;
	/** The file the thread is anchored to on the PR's current diff — `null` once GitHub can no longer place it there (e.g. the file was since deleted). */
	path: string | null;
	/** 1-indexed line the thread is anchored to — `null` in the same "can no longer place it" case as `path`. */
	line: number | null;
	/**
	 * The thread's first comment's own body — the exact text a caller like
	 * Sentinel posted for a specific finding. Lets a caller diff a prior
	 * thread's own content against the current push's findings (holocron#860)
	 * to decide whether that finding is still live, rather than only knowing
	 * a thread exists. `undefined` in the same no-comments case as
	 * `authorLogin`.
	 */
	body: string | undefined;
}

interface ListReviewThreadsResponse {
	repository: {
		pullRequest: {
			reviewThreads: {
				nodes: Array<{
					id: string;
					isResolved: boolean;
					path: string | null;
					line: number | null;
					comments: { nodes: Array<{ author: { login: string } | null; body: string }> };
				}>;
			};
		};
	};
}

const LIST_REVIEW_THREADS_QUERY = `
	query($owner: String!, $name: String!, $number: Int!) {
		repository(owner: $owner, name: $name) {
			pullRequest(number: $number) {
				reviewThreads(first: 100) {
					nodes {
						id
						isResolved
						path
						line
						comments(first: 1) {
							nodes {
								author { login }
								body
							}
						}
					}
				}
			}
		}
	}
`;

const RESOLVE_REVIEW_THREAD_MUTATION = `
	mutation($threadId: ID!) {
		resolveReviewThread(input: { threadId: $threadId }) {
			thread { id isResolved }
		}
	}
`;

export function pulls(rest: RestClient, graphql: GraphQLClient) {
	return {
		getPullRequest: (repo: string, number: number): Promise<GitHubPullRequest> =>
			rest.request<GitHubPullRequest>(`${repoBase(repo)}/pulls/${number}`),

		/**
		 * A PR's own commits, in commit order. `per_page=100` — GitHub's max —
		 * covers every real PR in this org; a PR genuinely exceeding 100
		 * commits (GitHub caps this endpoint at 250 regardless of pagination)
		 * is an edge case no consumer here needs to paginate for today.
		 */
		listCommits: (repo: string, number: number): Promise<GitHubPullRequestCommit[]> =>
			rest.request<GitHubPullRequestCommit[]>(`${repoBase(repo)}/pulls/${number}/commits?per_page=100`),

		/**
		 * A PR's own changed files. `per_page=100` — GitHub's max — covers
		 * every real PR in this org; a PR genuinely exceeding 100 changed
		 * files (GitHub caps this endpoint at 3000 regardless of pagination)
		 * is an edge case no consumer here needs to paginate for today.
		 */
		listFiles: (repo: string, number: number): Promise<GitHubPullRequestFile[]> =>
			rest.request<GitHubPullRequestFile[]>(`${repoBase(repo)}/pulls/${number}/files?per_page=100`),

		/**
		 * Submits a review in one call — GitHub has no separate "create draft,
		 * then submit" step when `event` is provided directly (the multi-step
		 * `PENDING` review flow exists for the web UI's own draft-comments
		 * experience, not needed here).
		 */
		createReview: (repo: string, number: number, input: CreateReviewInput): Promise<GitHubPullRequestReview> =>
			rest.request<GitHubPullRequestReview>(`${repoBase(repo)}/pulls/${number}/reviews`, {
				method: "POST",
				body: input,
			}),

		/** Every review thread on a PR, resolved or not — GraphQL-only, `first: 100` covers every real PR's review-thread count in this org today; no consumer needs pagination yet. */
		listReviewThreads: async (repo: string, number: number): Promise<ReviewThread[]> => {
			const [owner, name] = splitRepo(repo);
			const result = await graphql.query<ListReviewThreadsResponse>(LIST_REVIEW_THREADS_QUERY, {
				owner,
				name,
				number,
			});
			return result.repository.pullRequest.reviewThreads.nodes.map((node) => ({
				id: node.id,
				isResolved: node.isResolved,
				path: node.path,
				line: node.line,
				authorLogin: node.comments.nodes[0]?.author?.login,
				body: node.comments.nodes[0]?.body,
			}));
		},

		/**
		 * Marks one review thread resolved. Requires `Contents: Write` —
		 * confirmed directly against GitHub's own behavior (surprising, since
		 * resolving a thread creates no commit, touches no file, moves no
		 * ref — it only toggles a boolean on PR conversation metadata), not
		 * `Pull requests: Write` the way `createReview()` needs.
		 */
		resolveReviewThread: (threadId: string): Promise<void> =>
			graphql.query(RESOLVE_REVIEW_THREAD_MUTATION, { threadId }),
	};
}
