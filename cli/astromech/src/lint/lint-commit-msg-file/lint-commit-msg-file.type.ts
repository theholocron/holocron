import type { CommitMessageViolation } from "../lint-message/index.js";

/** What linting a commit message file found. */
export interface LintCommitMsgFileResult {
	/** Whether the message broke no rule. */
	valid: boolean;
	/** Each rule the message broke; empty when it is valid. */
	violations: CommitMessageViolation[];
}
