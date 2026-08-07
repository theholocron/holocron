/**
 * Filter raw env vars to only those matching a namespace prefix,
 * stripping the prefix from each key before returning.
 *
 * Case-insensitive: "holocron_debug" and "HOLOCRON_DEBUG" both match
 * namespace "HOLOCRON".
 *
 * @example
 * filterByNamespace({ HOLOCRON_DEBUG: "true", PORT: "3000" }, "HOLOCRON")
 * // → { DEBUG: "true" }
 */
export function filterByNamespace(
	raw: Record<string, string | undefined>,
	namespace: string
): Record<string, string | undefined> {
	const prefix = `${namespace.toUpperCase()}_`;
	const result: Record<string, string | undefined> = {};

	for (const [key, value] of Object.entries(raw)) {
		if (key.toUpperCase().startsWith(prefix)) {
			result[key.slice(prefix.length)] = value;
		}
	}

	return result;
}

/**
 * Merge multiple namespace-filtered views of a raw env record.
 *
 * Uses a cascade model — **later entries win** over earlier ones when
 * the same key exists under multiple prefixes. Put broad/global
 * namespaces first and project-specific overrides last, the same way
 * you would layer CSS rules or Object.assign calls.
 *
 * @example
 * // HOLOCRON_DEBUG is the org-wide default; CLI_TEMPLATE_DEBUG overrides it.
 * mergeNamespaces(raw, ["HOLOCRON", "CLI_TEMPLATE"])
 */
export function mergeNamespaces(
	raw: Record<string, string | undefined>,
	namespaces: string[]
): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};

	// Forward iteration: later namespaces overwrite earlier ones (last wins).
	for (const ns of namespaces) {
		Object.assign(result, filterByNamespace(raw, ns));
	}

	return result;
}
