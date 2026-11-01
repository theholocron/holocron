import type { RestClient } from "../utils.js";
import { filePath, repoBase, toBase64 } from "../utils.js";

/** A git reference (such as a branch) and the object it points at. */
export interface GitRef {
	/** The object the reference points at. */
	object: {
		/** The object's SHA. */
		sha: string;
		/** The object's type, e.g. `commit`. */
		type: string;
		/** The API URL of the object. */
		url: string;
	};
	/** The full reference name, e.g. `refs/heads/main`. */
	ref: string;
	/** The API URL of the reference. */
	url: string;
}

/** A git commit, with only the fields this client reads. */
export interface GitCommit {
	/** The commit's SHA. */
	sha: string;
	/** The tree the commit points at. */
	tree: {
		/** The tree's SHA. */
		sha: string;
		/** The API URL of the tree. */
		url: string;
	};
}

/** One entry of a git tree. */
export interface GitTreeItem {
	/** The entry's path within the tree. */
	path: string;
	/** The entry's object SHA. */
	sha: string;
	/** The kind of object the entry points at, e.g. `blob` or `tree`. */
	type: string;
	/** The entry's file mode, e.g. `100644`. */
	mode?: string;
	/** The blob's size in bytes; absent for trees. */
	size?: number;
}

/** A git tree as GitHub returns it. */
export interface GitTree {
	/** The tree's SHA. */
	sha: string;
	/** The entries of the tree. */
	tree: GitTreeItem[];
	/** Whether GitHub cut the entry list short because the tree was too large. */
	truncated: boolean;
}

/** A file's contents as the contents API returns them. */
export interface GitContents {
	/** The file content, encoded as named by `encoding`. */
	content: string;
	/** The encoding of `content`, normally `base64`. */
	encoding: string;
	/** The file's blob SHA. */
	sha: string;
	/** The file's name. */
	name: string;
	/** The file's path in the repository. */
	path: string;
}

/** What `git.putContents` returns: the file's new blob sha (the `sha` to pass next time) and the commit it made. */
export interface PutContentsResult {
	/** The file written: its path and its new blob SHA. */
	content: {
		/** The file's new blob SHA. */
		sha: string;
		/** The file's path. */
		path: string;
	};
	/** The commit that was made. */
	commit: {
		/** The new commit's SHA. */
		sha: string;
	};
}

/** The body of a `putContents()` request. */
export interface PutContentsInput {
	/** The commit message. */
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

/** A git blob created in the repository. */
export interface GitBlob {
	/** The blob's SHA. */
	sha: string;
	/** The API URL of the blob. */
	url: string;
}

/** A pull request as returned when one is created, with only the fields this client reads. */
export interface GitPull {
	/** The pull request's number. */
	number: number;
	/** The URL of the pull request's page on GitHub. */
	html_url: string;
	/** The pull request's title. */
	title: string;
}

/** The body of a `createPull()` request. */
export interface CreatePullInput {
	/** The pull request's title. */
	title: string;
	/** The branch the changes come from. */
	head: string;
	/** The branch the changes are to be merged into. */
	base: string;
	/** The pull request's description. */
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
