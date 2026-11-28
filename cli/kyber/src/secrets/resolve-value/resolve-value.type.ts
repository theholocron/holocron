/** Options for `resolveValue`. */
export interface ResolveValueOptions {
	/**
	 * An upper-case prefix without a trailing underscore (`"HOLOCRON"`). Each name is then tried as `<prefix>_<name>`
	 * and then as the bare `<name>`, in both the environment and the `credentials` providers' variables, so a caller
	 * names the variable once instead of listing the pair. A name that already starts with `<prefix>_` is tried as it
	 * is, not prefixed twice.
	 */
	prefix?: string;
}
