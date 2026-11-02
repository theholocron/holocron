/** One frontmatter field: its trimmed value and the 1-indexed line it sits on in the file. */
export interface SpecField {
	/** The text after the colon, trimmed; empty for a key that only opens a nested block (`discussion:`). */
	value: string;
	/** 1-indexed, counting the opening `---` as line 1. */
	line: number;
}

/**
 * A file's frontmatter by key. One level of nesting is keyed `parent.child` (`discussion.github`), and the parent
 * key is there too.
 */
export type SpecFrontmatter = Map<string, SpecField>;

/** The kind of file the ADR and spec check reads: an architecture decision record or a design spec. */
export type SpecKind = "adr" | "spec";

/** One problem the ADR and spec check found in a file. */
export interface SpecFinding {
	/** The file's repo-relative path, as it was given to the check. */
	file: string;
	/** 1-indexed: the offending field's own line, or the first line when the field (or the whole frontmatter) is missing. */
	line: number;
	/** The frontmatter field at fault (`id`, `status`, ...), or `frontmatter` when there is none at all. */
	rule: string;
	/** What is wrong, as a sentence. */
	reason: string;
	/** An `error` fails the check; a `warning` is reported and never fails it. */
	severity: "error" | "warning";
}

/** A file to check: its repo-relative path and its text. */
export interface SpecFile {
	/** Repo-relative, with `/` separators. */
	path: string;
	/** The file's whole text. */
	text: string;
}

/** What the ADR and spec check found across the files it was given. */
export interface SpecsResult {
	/** How many of the files were an ADR or a spec (the rest were not the check's business and were skipped). */
	fileCount: number;
	/** Every problem found, in file order. */
	findings: SpecFinding[];
}

/** What happened to a pull request that touches a spec: it was opened (or reopened), got another push, or was merged. */
export type SpecChangeEvent = "opened" | "updated" | "merged";

/** One spec file in a pull request event, as it was before the event and after it. */
export interface SpecChange {
	/** What happened to the pull request. */
	event: SpecChangeEvent;
	/** The file's repo-relative path. */
	path: string;
	/** The file's text before the event, or `undefined` when it did not exist yet. */
	before: string | undefined;
	/** The file's text after the event, or `undefined` when the event removed it. */
	after: string | undefined;
}

/**
 * Why a spec is worth announcing: `new` (the file is added), `status` (its `status` changed), `edited` (a pull request
 * was opened that edits it) or `merged` (the pull request that touches it landed).
 */
export type SpecAnnouncementKind = "new" | "edited" | "status" | "merged";

/** A spec change worth a post, with what the post says about it. */
export interface SpecAnnouncement {
	/** The file's repo-relative path. */
	path: string;
	/** The spec's first heading, or its file name when it has none, stripped of anything that would format or link. */
	title: string;
	/** Why it is worth announcing. */
	kind: SpecAnnouncementKind;
	/** The spec's `status` after the event; absent when it has none. */
	status?: string;
	/** The spec's `status` before the event, when the event changed it. */
	previousStatus?: string;
}

/** The pull request an announcement is about. */
export interface SpecPullRequest {
	/** The pull request's number. */
	number: number;
	/** The pull request's address. */
	url: string;
}

/** The three statuses of a spec that its discussion post is reconciled by. */
export interface StatusTriple {
	/** The `status` in the file; `undefined` when it has none. */
	file: string | undefined;
	/** The status the post's tag shows; `undefined` when it has no status tag, or more than one. */
	tag: string | undefined;
	/** The status the file and the tag last agreed on, as written on the post; `undefined` when it carries none yet. */
	synced: string | undefined;
}

/**
 * What to do about a spec's status: `none` (in step), `record` (in step, but the post's last-synced line is stale: just
 * rewrite it), `set-tag` (the file is right: put its status on the tag), `request` (the tag was changed on purpose: ask
 * for the file to change) or `conflict` (both moved, or there is no way to tell: change nothing and say why).
 */
export type StatusReconciliation =
	| { action: "none" }
	| { action: "record"; status: string }
	| { action: "set-tag"; status: string }
	| { action: "request"; status: string }
	| { action: "conflict"; reason: string };
