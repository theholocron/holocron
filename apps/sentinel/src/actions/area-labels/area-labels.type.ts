/** What a delivery asks of the area labels, normalized from the webhook event. */
export type AreaLabelsTrigger =
	/** A pull request that was opened, reopened, pushed to, or had its title edited: its areas come from the diff. */
	| { kind: "pull_request"; number: number }
	/** An issue that was opened or had its title edited: its areas come from the title's scope. */
	| { kind: "issue"; number: number };

/** The declaration the labels follow: `repo.labels` of the repository's own config (names and patterns only). */
export interface AreaLabelsConfig {
	/** Area name to folder patterns (a `!` pattern takes a path out of the area). */
	areas: Record<string, string[]>;
	/** Title scope to area name. */
	scopes?: Record<string, string>;
}
