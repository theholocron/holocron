/** An Environment that holds none of the tokens a plugin lists. Its message names the variables looked for, never a value. */
export class HoldsNoTokenError extends Error {
	override name = "HoldsNoTokenError";
}
