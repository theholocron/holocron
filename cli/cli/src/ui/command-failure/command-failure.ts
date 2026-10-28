import { describeProviderError } from "../provider-error/index.js";

/**
 * Error class names whose `.message` is a complete, actionable sentence. Any other error is printed too, so a command
 * that throws a plain `Error` is never silent; this set only marks the ones written to be read as they are.
 */
export const USER_FACING_ERRORS = new Set(["WorkspaceContextError", "ConfigFileError", "NonInteractiveError"]);

/**
 * The line to print for an error that reached the top level: its message with control characters stripped (a provider's
 * text can carry them), plus a provider's response detail when it has one. Never empty, so a failure always says
 * something.
 */
export function commandFailureMessage(err: unknown): string {
	return describeProviderError(err) || (err instanceof Error ? err.name : "the command failed");
}
