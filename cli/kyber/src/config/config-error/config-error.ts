/**
 * Thrown when a config is invalid, or when `compose()` is given fragments whose `requires` are not met. A caller that
 * may load a second copy of this package matches it by `name`, not `instanceof`.
 */
export class ConfigError extends Error {
	/** The error name, `ConfigError`. */
	override name = "ConfigError";
}
