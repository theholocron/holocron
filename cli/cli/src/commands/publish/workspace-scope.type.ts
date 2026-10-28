/** Which packages of the workspace an operation covers. */
export interface WorkspaceScope {
	/** Only this version group: a folder of the repo (`clients`, `observability`). */
	group?: string;
	/** Everything except these version groups, which release on their own. */
	excludeGroups?: readonly string[];
}
