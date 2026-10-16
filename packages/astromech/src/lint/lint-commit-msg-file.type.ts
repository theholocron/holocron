import type { CommitMessageViolation } from "./lint-message.type.js";

export interface LintCommitMsgFileResult {
	valid: boolean;
	violations: CommitMessageViolation[];
}
