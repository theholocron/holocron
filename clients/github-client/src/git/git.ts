import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

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

		getTree: (
			repo: string,
			sha: string,
			recursive = false,
		): Promise<GitTree> =>
			rest.request<GitTree>(
				`${repoBase(repo)}/git/trees/${sha}${recursive ? "?recursive=1" : ""}`,
			),

		getContents: (repo: string, path: string): Promise<GitContents> =>
			rest.request<GitContents>(`${repoBase(repo)}/contents/${path}`),

		createBlob: (
			repo: string,
			content: string,
			encoding = "utf-8",
		): Promise<GitBlob> =>
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
			baseTree?: string,
		): Promise<GitTree> =>
			rest.request<GitTree>(`${repoBase(repo)}/git/trees`, {
				method: "POST",
				body: { base_tree: baseTree, tree },
			}),

		createCommit: (
			repo: string,
			message: string,
			tree: string,
			parents: string[],
		): Promise<GitCommit> =>
			rest.request<GitCommit>(`${repoBase(repo)}/git/commits`, {
				method: "POST",
				body: { message, tree, parents },
			}),

		createRef: (repo: string, ref: string, sha: string): Promise<GitRef> =>
			rest.request<GitRef>(`${repoBase(repo)}/git/refs`, {
				method: "POST",
				body: { ref, sha },
			}),

		updateRef: (
			repo: string,
			ref: string,
			sha: string,
			force = false,
		): Promise<GitRef> =>
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
