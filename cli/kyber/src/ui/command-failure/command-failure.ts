import { describeError } from "../describe-error/index.js";

/**
 * The line to print for an error that reached the top of a command: {@link describeError | describeError}'s text, and
 * never empty, so a failure always says something. An error with no message prints its class name; anything else with
 * no text prints "the command failed".
 */
export function commandFailureMessage(err: unknown): string {
	return describeError(err) || (err instanceof Error ? err.name : "the command failed");
}
