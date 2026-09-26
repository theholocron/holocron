/**
 * Shared glob-ish path matcher for a Bucket 1 check's own ignore-pattern
 * list (`ALEX_IGNORE_PATTERNS`, `PRETTIER_IGNORE_PATTERNS`, …) — an exact
 * path, or a `dir/*` prefix. Not a general glob matcher — matches what's
 * actually in those lists today.
 */
export function isIgnored(path: string, patterns: readonly string[]): boolean {
	return patterns.some((pattern) =>
		pattern.endsWith("/*") ? path.startsWith(pattern.slice(0, -1)) : path === pattern
	);
}
