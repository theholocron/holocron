/** How {@link convergeCreatedIssue} settled an issue a run has just created. */
export interface ConvergedIssue {
	/** The key to record on the note: the created issue's, or the older issue that won. */
	key: string;
	/** The row's detail. */
	detail: string;
	/** True when the owner has something to do by hand (a duplicate could not be settled); the note is filed anyway. */
	warning: boolean;
}
