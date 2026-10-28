import type { CommitMessageViolation } from "../lint-message/index.js";

export interface LintCommitMsgFileResult {
	valid: boolean;
	violations: CommitMessageViolation[];
}
