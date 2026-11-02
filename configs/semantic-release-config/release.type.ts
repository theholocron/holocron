/** The slice of a semantic-release commit this module reads. */
export interface ReleaseCommit {
	/** Full commit hash. */
	hash: string;
	[key: string]: unknown;
}

/** The slice of a semantic-release plugin context this module reads; everything else passes through untouched. */
export interface ReleaseContext {
	cwd?: string;
	commits?: ReleaseCommit[];
	[key: string]: unknown;
}

/** A semantic-release plugin step that looks at commits. */
export type CommitStep = "analyzeCommits" | "generateNotes" | "success";

type StepFn = (pluginConfig: unknown, context: ReleaseContext) => unknown;

/** A plugin module that implements `Step`. */
export type StepPlugin<Step extends CommitStep> = Partial<Record<Step, StepFn>>;
