export interface CommitMessageViolation {
	/** Rule name, e.g. `"subject-empty"`. */
	rule: string;
	/** commitlint's own message for the failure, e.g. `"subject may not be empty"`. */
	message: string;
}
