import { MissingTokenError } from "../../plugin/index.js";

/**
 * Why a provider call could not be tried for want of a token, or undefined when the error is something else. A plugin
 * resolves its token on first use and throws an `AuthError` naming where it looked; the GitHub plugin throws a
 * {@link MissingTokenError}. Both mean "no token", which a deep check reports as a skip, not a failure. The
 * `AuthError` is matched by name because the plugin and the CLI may each hold their own copy of the class.
 */
export function missingTokenReason(err: unknown): string | undefined {
	if (err instanceof MissingTokenError) return err.message;
	if (err instanceof Error && err.name === "AuthError") return err.message;
	return undefined;
}
