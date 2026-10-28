/**
 * Thrown when a config file is found but cannot be loaded — malformed
 * JSON, a syntax error in a `.ts` / `.js` module, or no usable default
 * export. "Not found" is never an error: {@link loadConfigFile} returns
 * `null` for that.
 */
export class ConfigFileError extends Error {
	override name = "ConfigFileError";

	constructor(
		message: string,
		/** Absolute path of the offending file, when known. */
		readonly filepath?: string
	) {
		super(message);
	}
}
