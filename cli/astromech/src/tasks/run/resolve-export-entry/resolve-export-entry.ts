/**
 * Unwrap a `package.json#exports` subpath entry down to its file path —
 * either a bare string, or an object with condition keys (`import`,
 * `default`, `require`, …) that may themselves nest one level (`{ import: {
 * types, default } }`, the shape every `@theholocron/*-config` package
 * actually uses). Prefers `import` (this org ships ESM), then `default`,
 * then `require` as a last resort.
 */
export function resolveExportEntry(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry;
	if (entry === null || typeof entry !== "object") return undefined;

	const conditions = entry as Record<string, unknown>;
	const value = conditions.import ?? conditions.default ?? conditions.require;
	if (typeof value === "string") return value;
	if (typeof value === "object" && value !== null) return resolveExportEntry(value);
	return undefined;
}
