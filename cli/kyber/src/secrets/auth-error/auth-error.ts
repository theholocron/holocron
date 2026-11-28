/**
 * Thrown by a token resolver when no token was found in any source. Its message says how to supply one. A caller that
 * may load a second copy of this package matches it by `name`, not `instanceof`.
 */
export class AuthError extends Error {
	/** The error name, `AuthError`. */
	override name = "AuthError";
}
