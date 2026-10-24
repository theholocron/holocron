import type { RestClient } from "../utils.js";
import { filePath, repoBase, toBase64 } from "../utils.js";

export interface GitRef {
	object: { sha: string; type: string; url: string };
	ref: string;
	url: string;
}

export interface GitCommit {
	sha: string;
	tree: { sha: string; url: string };
}

export interface GitTreeItem {
	path: string;
	sha: string;
	type: string;
	mode?: string;
	size?: number;
}

export interface GitTree {
	sha: string;
	tree: GitTreeItem[];
	truncated: boolean;
}

export interface GitContents {
	content: string;
	encoding: string;
	sha: string;
	name: string;
	path: string;
}

/** What `git.putContents` returns: the file's new blob sha (the `sha` to pass next time) and the commit it made. */
export interface PutContentsResult {
	content: { sha: string; path: string };
	commit: { sha: string };
}

export interface PutContentsInput {
	message: string;
	/** The new file text (UTF-8); the client encodes it. */
	content: string;
	/**
	 * The blob `sha` of the file being replaced, from `getContents`. Required to update an existing file,
	 * and omitted to create one. This is what makes the write safe: if someone changed the file since it was
	 * read, GitHub refuses (409) instead of overwriting, so the caller can read again and retry.
	 */
	sha?: string;
	/** Defaults to the repo's default branch. */
	branch?: string;
}

export interface GitBlob {
	sha: string;
	url: string;
}

export interface GitPull {
	number: number;
	html_url: string;
	title: string;
}

export interface CreatePullInput {
	title: string;
	head: string;
	base: string;
	body?: string;
}

export function git(rest: RestClient) {
	return {
		getRef: (repo: string, branch: string): Promise<GitRef> =>
			rest.request<GitRef>(`${repoBase(repo)}/git/ref/heads/${branch}`),

		getCommit: (repo: string, sha: string): Promise<GitCommit> =>
			rest.request<GitCommit>(`${repoBase(repo)}/git/commits/${sha}`),

		getTree: (repo: string, sha: string, recursive = false): Promise<GitTree> =>
			rest.request<GitTree>(`${repoBase(repo)}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`),

		/**
		 * `ref` defaults to the repo's default branch (GitHub's own default)
		 * when omitted — the security-relevant choice every existing caller
		 * relies on (D4/D6, `validateConfig()`'s own docstring). Pass it
		 * explicitly to read a specific commit/branch's content instead — a
		 * same-repo PR branch is no longer a new trust boundary for this org
		 * (D6-amended, `tech-sentinel-ci-runner.spec.md`), just never a fork's.
		 */
		getContents: (repo: string, path: string, ref?: string): Promise<GitContents> =>
			rest.request<GitContents>(`${repoBase(repo)}/contents/${path}`, ref ? { query: { ref } } : undefined),

		/**
		 * `PUT /repos/:repo/contents/:path` — creates or updates one file in a single commit. Pass `sha` when
		 * updating so a concurrent change is refused (409) and not silently overwritten.
		 */
		putContents: (repo: string, path: string, input: PutContentsInput): Promise<PutContentsResult> =>
			rest.request<PutContentsResult>(`${repoBase(repo)}/contents/${filePath(path)}`, {
				method: "PUT",
				body: {
					message: input.message,
					content: toBase64(input.content),
					...(input.sha ? { sha: input.sha } : {}),
					...(input.branch ? { branch: input.branch } : {}),
				},
			}),

		createBlob: (repo: string, content: string, encoding = "utf-8"): Promise<GitBlob> =>
			rest.request<GitBlob>(`${repoBase(repo)}/git/blobs`, {
				method: "POST",
				body: { content, encoding },
			}),

		createTree: (
			repo: string,
			tree: Array<{
				path: string;
				mode: string;
				type: string;
				sha: string;
			}>,
			baseTree?: string
		): Promise<GitTree> =>
			rest.request<GitTree>(`${repoBase(repo)}/git/trees`, {
				method: "POST",
				body: { base_tree: baseTree, tree },
			}),

		createCommit: (repo: string, message: string, tree: string, parents: string[]): Promise<GitCommit> =>
			rest.request<GitCommit>(`${repoBase(repo)}/git/commits`, {
				method: "POST",
				body: { message, tree, parents },
			}),

		createRef: (repo: string, ref: string, sha: string): Promise<GitRef> =>
			rest.request<GitRef>(`${repoBase(repo)}/git/refs`, {
				method: "POST",
				body: { ref, sha },
			}),

		updateRef: (repo: string, ref: string, sha: string, force = false): Promise<GitRef> =>
			rest.request<GitRef>(`${repoBase(repo)}/git/refs/${ref}`, {
				method: "PATCH",
				body: { sha, force },
			}),

		createPull: (repo: string, input: CreatePullInput): Promise<GitPull> =>
			rest.request<GitPull>(`${repoBase(repo)}/pulls`, {
				method: "POST",
				body: input,
			}),
	};
}
