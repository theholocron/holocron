/**
 * Raised when a prompt is needed but stdin isn't a TTY. A non-TTY run (CI, a
 * script, a pipe) throws this instead of hanging on `@inquirer/prompts`, which
 * otherwise throws its own `ExitPromptError` the moment stdin closes. `cli.ts`'s
 * `USER_FACING_ERRORS` catch prints the message cleanly.
 */
export class NonInteractiveError extends Error {
	/** The error's name, `NonInteractiveError`, so a catch can tell it from any other error. */
	override name = "NonInteractiveError";
}
