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

/** The front matter fields `updateFrontmatter` can set. A field left out is left alone. */
export interface FrontmatterChanges {
	/** The new `status`. */
	status?: string;
	/** The address of the document's discussion post, written as `discussion.url`. */
	discussionUrl?: string;
}
