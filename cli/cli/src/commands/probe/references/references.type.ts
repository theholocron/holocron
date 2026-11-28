/** One text file of a repository. */
export interface RepoFile {
	/** Path relative to the repository root. */
	path: string;
	text: string;
}

/** A repository to scan. `files` is read lazily so one checkout is held at a time. */
export interface ScannedRepo {
	name: string;
	/** Whether it is a GitHub template repository. */
	isTemplate: boolean;
	files(): Iterable<RepoFile>;
}

/** What a reference points at: a reusable workflow, a composite action, or anything else under `.github/`. */
export type ReferenceKind = "workflow" | "action" | "other";

export interface Reference {
	repo: string;
	file: string;
	line: number;
	kind: ReferenceKind;
	/** The line, trimmed. */
	text: string;
}
