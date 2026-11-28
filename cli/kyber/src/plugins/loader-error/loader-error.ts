/** Raised when a plugin cannot be imported, does not export what a plugin must, or a capability is asked for and absent. */
export class LoaderError extends Error {
	override name = "LoaderError";
}
