import type { GitHubClient } from "@theholocron/github-client";

export interface ActionlintResult {
	message: string;
	line: number;
	column: number;
	kind: string;
}

export type RunLint = (source: string, path: string) => Promise<ActionlintResult[]>;

/** One ShellCheck JSON1 comment — the subset of fields this check reads. */
export interface ShellCheckComment {
	line: number;
	column: number;
	level: "error" | "warning" | "info" | "style";
	code: number;
	message: string;
}

export interface LintActionlintInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each changed file's content there, not the default branch. */
	ref: string;
}

export interface ActionlintMessage {
	file: string;
	/** 1-indexed. */
	line: number;
	/** 1-indexed. */
	column: number;
	/** actionlint's own rule kind (`expression`, `syntax-check`, `job-needs`, …) or a ShellCheck code (`SC2086`). */
	ruleId: string;
	reason: string;
	/**
	 * Every actionlint finding is `"error"` (actionlint has no severity axis —
	 * the binary fails on any of them). ShellCheck's own level splits:
	 * `error`/`warning` → `"error"`, `info`/`style` → `"warning"` (advisory).
	 */
	severity: "error" | "warning";
}

export interface LintActionlintResult {
	valid: boolean;
	fileCount: number;
	messages: ActionlintMessage[];
}

/** One step's `run:` script, with everything needed to lint it and map findings back to the file. */
export interface RunScript {
	script: string;
	/** The resolved shell, before narrowing to what ShellCheck supports (e.g. `"bash"`, `"bash -e {0}"`, `"pwsh"`). */
	shell: string;
	/** 1-indexed position of the `run:` value — the fallback anchor for anything {@link blockStart} can't map. */
	line: number;
	column: number;
	/**
	 * Set only for a `|` literal block scalar: script line N lives on file
	 * line `line + N`, script column C at file column `indent + C`.
	 */
	blockStart?: { line: number; indent: number };
}
